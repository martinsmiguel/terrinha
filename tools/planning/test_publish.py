import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest

module = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-entrega.py'))
p = importlib.util.module_from_spec(module)
module.loader.exec_module(p)


class FakeAPI:
    def __init__(self):
        self.objects = {('issues', 1): {'number': 1, 'title': 'card', 'body': 'Nota manual\n- [x] Revisão humana', 'milestone': None}}
        self.writes = []
        self.fail = None

    def read(self, kind, number):
        return copy.deepcopy(self.objects[(kind, number)])

    def find(self, kind, title):
        return [copy.deepcopy(v) for (k, _), v in self.objects.items() if k == kind and v['title'] == title]

    def write(self, kind, number, fields):
        self.writes.append((kind, number, copy.deepcopy(fields)))
        if self.fail == 'before':
            self.fail = None
            raise RuntimeError('API indisponível')
        number = number or 2
        obj = self.objects.setdefault((kind, number), {'number': number, 'body': '', 'milestone': None})
        obj.update(fields)
        if self.fail == 'after':
            self.fail = None
            raise RuntimeError('Resposta perdida após gravação')
        return copy.deepcopy(obj)


def spec(fields=None, number=1):
    return {'repo': 'owner/repo', 'operations': [{'id': 'card', 'kind': 'issues', **({'number': number} if number else {}),
                                               'fields': fields or {'planning': 'Plano vigente'}}]}


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name)
        self.api = FakeAPI()

    def tearDown(self):
        self.tmp.cleanup()

    def test_prepare_has_zero_writes_and_preserves_manual_body(self):
        plan = p.prepare(spec(), self.api)
        self.assertIn(self.api.objects[('issues', 1)]['body'], plan['operations'][0]['desired']['body'])
        self.assertEqual([], self.api.writes)

    def test_noop_and_resume_do_not_write(self):
        plan = p.prepare(spec({'title': 'card'}), self.api)
        self.assertEqual(0, p.apply(plan, self.state, self.api, 1)['writes'])
        self.assertEqual(0, p.apply(plan, self.state, self.api, 1)['writes'])
        self.assertEqual([], self.api.writes)

    def test_conflict_preserves_intervention(self):
        plan = p.prepare(spec(), self.api)
        self.api.objects[('issues', 1)]['body'] += '\nNova anotação humana'
        with self.assertRaises(p.Conflict):
            p.apply(plan, self.state, self.api, 1)
        self.assertEqual([], self.api.writes)

    def test_resume_after_lost_patch_response_and_recover(self):
        plan = p.prepare(spec(), self.api)
        before = self.api.read('issues', 1)
        self.api.fail = 'after'
        with self.assertRaises(RuntimeError):
            p.apply(plan, self.state, self.api, 1)
        self.assertEqual('intent', json.loads((self.state / 'journal.json').read_text())['objects']['card']['status'])
        p.apply(plan, self.state, self.api, 1)
        self.assertEqual(1, len(self.api.writes))
        p.apply(plan, self.state, self.api, 1, recover=True)
        self.assertEqual(before, self.api.read('issues', 1))
        p.apply(plan, self.state, self.api, 1, recover=True)
        self.assertEqual(2, len(self.api.writes))

    def test_creation_response_lost_does_not_duplicate_and_recovery_never_deletes(self):
        plan = p.prepare(spec({'title': 'new', 'planning': 'Plano'}, number=None), self.api)
        self.api.fail = 'after'
        with self.assertRaises(RuntimeError):
            p.apply(plan, self.state, self.api, 1)
        p.apply(plan, self.state, self.api, 1)
        p.apply(plan, self.state, self.api, 1, recover=True)
        self.assertEqual(1, len(self.api.writes))
        self.assertEqual(2, len(self.api.objects))

    def test_creation_unknown_is_not_retried_blindly(self):
        plan = p.prepare(spec({'title': 'new'}, number=None), self.api)
        self.api.fail = 'before'
        with self.assertRaises(RuntimeError):
            p.apply(plan, self.state, self.api, 1)
        with self.assertRaises(p.Conflict):
            p.apply(plan, self.state, self.api, 1)
        self.assertEqual(1, len(self.api.writes))

    def test_batch_cap_and_partial_failure_recovery(self):
        s = spec()
        self.api.objects[('issues', 3)] = {'number': 3, 'title': 'second', 'body': 'manual 2', 'milestone': None}
        s['operations'].append({'id': 'second', 'kind': 'issues', 'number': 3, 'fields': {'planning': 'Second'}})
        plan = p.prepare(s, self.api)
        self.assertEqual(1, p.apply(plan, self.state, self.api, 1)['writes'])
        self.api.fail = 'before'
        with self.assertRaises(RuntimeError):
            p.apply(plan, self.state, self.api, 1)
        p.apply(plan, self.state, self.api, 12, recover=True)
        self.assertEqual('Nota manual\n- [x] Revisão humana', self.api.read('issues', 1)['body'])
        self.assertEqual('manual 2', self.api.read('issues', 3)['body'])

    def test_recovery_refuses_manual_change_after_write(self):
        plan = p.prepare(spec(), self.api)
        p.apply(plan, self.state, self.api, 1)
        self.api.objects[('issues', 1)]['body'] += '\nIntervenção'
        with self.assertRaises(p.Conflict):
            p.apply(plan, self.state, self.api, 1, recover=True)
        self.assertEqual(1, len(self.api.writes))

    def test_raw_body_and_legacy_spec_rejected(self):
        for s in [spec({'body': 'substituição'}), {'repo': 'owner/repo', 'issues': []}]:
            with self.assertRaises(p.Conflict):
                p.prepare(s, self.api)

    def test_broken_delimiters_refused(self):
        with self.assertRaises(p.Conflict):
            p.managed(p.START + 'incompleto', 'novo')

    def test_changed_plan_refused_on_resume(self):
        plan = p.prepare(spec(), self.api)
        p.apply(plan, self.state, self.api, 1)
        changed = copy.deepcopy(plan)
        changed['operations'][0]['desired']['title'] = 'other'
        with self.assertRaises(p.Conflict):
            p.apply(changed, self.state, self.api, 1)

    def test_explicit_apply_requires_cap_before_any_api(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('publish-entrega.py')),
                                 '--state', str(self.state), '--apply'], capture_output=True, text=True)
        self.assertEqual(2, result.returncode)
        self.assertEqual([], list(self.state.iterdir()))

    def test_readback_failure_is_journaled_and_recoverable(self):
        plan = p.prepare(spec(), self.api)
        write = self.api.write
        def corrupted(kind, number, desired):
            response = write(kind, number, desired)
            self.api.objects[(kind, response['number'])]['body'] += ' inesperado'
            return response
        self.api.write = corrupted
        with self.assertRaises(p.Conflict):
            p.apply(plan, self.state, self.api, 1)
        record = json.loads((self.state / 'journal.json').read_text())['objects']['card']
        self.assertIn('inesperado', record['after']['body'])
        self.api.write = write
        p.apply(plan, self.state, self.api, 1, recover=True)
        self.assertEqual(plan['operations'][0]['before'], self.api.read('issues', 1))

    def test_milestone_snapshot_and_readback(self):
        self.api.objects[('milestones', 1)] = {'number': 1, 'title': 'M1', 'description': 'nota manual'}
        s = {'repo': 'owner/repo', 'operations': [{'id': 'm1', 'kind': 'milestones', 'number': 1,
                                                'fields': {'planning': 'Marco atual'}}]}
        plan = p.prepare(s, self.api)
        p.apply(plan, self.state, self.api, 1)
        self.assertIn('nota manual', self.api.read('milestones', 1)['description'])
        p.apply(plan, self.state, self.api, 1, recover=True)
        self.assertEqual('nota manual', self.api.read('milestones', 1)['description'])

    def test_resume_detects_manual_change_in_other_snapshot_field(self):
        plan = p.prepare(spec(), self.api)
        p.apply(plan, self.state, self.api, 1)
        self.api.objects[('issues', 1)]['title'] = 'Novo título humano'
        with self.assertRaises(p.Conflict):
            p.apply(plan, self.state, self.api, 1)
        self.assertEqual(1, len(self.api.writes))

    def test_recovery_preview_has_restore_payload_without_write(self):
        plan = p.prepare(spec(), self.api)
        p.apply(plan, self.state, self.api, 1)
        preview = p.recovery_preview(plan, self.state)
        self.assertEqual('restore_written_fields', preview['operations'][0]['action'])
        self.assertEqual(plan['operations'][0]['before']['body'], preview['operations'][0]['restore']['body'])
        self.assertEqual(1, len(self.api.writes))

    def test_concurrent_state_lock_refused(self):
        with p.locked(self.state):
            with self.assertRaises(BlockingIOError):
                with p.locked(self.state):
                    self.fail('Segundo processo não deve adquirir lock')


if __name__ == '__main__':
    unittest.main()
