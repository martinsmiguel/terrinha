"""Planejamento GitHub opt-in: preparar, conferir, aplicar e recuperar campos."""
import argparse
import contextlib
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

START = '<!-- terrinha-planning:start -->'
END = '<!-- terrinha-planning:end -->'
FIELDS = {'issues': {'title', 'body', 'milestone'}, 'milestones': {'title', 'description'}}


class Conflict(RuntimeError):
    pass


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(tmp, path)


def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def fields(obj, kind):
    result = {key: obj.get(key) for key in FIELDS[kind]}
    if kind == 'issues' and isinstance(result['milestone'], dict):
        result['milestone'] = result['milestone']['number']
    return result


def managed(original, content):
    original = original or ''
    block = START + '\n' + content.strip() + '\n' + END
    if START in content or END in content:
        raise Conflict('Conteúdo não pode conter delimitadores de gestão')
    if START not in original and END not in original:
        return original + ('\n\n' if original else '') + block
    if original.count(START) != 1 or original.count(END) != 1:
        raise Conflict('Delimitadores duplicados ou incompletos')
    a, b = original.index(START), original.index(END)
    if a >= b:
        raise Conflict('Delimitadores fora de ordem')
    return original[:a] + block + original[b + len(END):]


class GitHub:
    def __init__(self, repo):
        self.repo = repo

    def call(self, endpoint, payload=None, method=None, pages=False):
        command = ['gh', 'api', f'repos/{self.repo}/{endpoint}']
        if pages:
            command += ['--paginate', '--slurp']
        if payload is not None:
            command += ['--method', method, '--input', '-']
        result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                                capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def read(self, kind, number):
        return self.call(f'{kind}/{number}')

    def find(self, kind, title):
        pages = self.call(f'{kind}?state=all&per_page=100', pages=True)
        return [obj for page in pages for obj in page if obj['title'] == title and 'pull_request' not in obj]

    def write(self, kind, number, desired):
        return self.call(f'{kind}/{number}' if number else kind, desired, 'PATCH' if number else 'POST')


def prepare(spec, api):
    if not re.fullmatch(r'[\w.-]+/[\w.-]+', spec.get('repo', '')):
        raise Conflict('repo precisa ser owner/name')
    if 'operations' not in spec:
        raise Conflict('Plano legado não é aceito: reconcilie para operations antes de preparar')
    plan = {'version': 1, 'repo': spec['repo'], 'spec_hash': digest(spec), 'operations': []}
    ids = set()
    targets = set()
    for item in spec['operations']:
        kind = item['kind']
        if kind not in FIELDS or item['id'] in ids:
            raise Conflict('Tipo desconhecido ou ID duplicado')
        ids.add(item['id'])
        changes = copy.deepcopy(item['fields'])
        allowed = FIELDS[kind] | {'planning'}
        if not changes or set(changes) - allowed:
            raise Conflict('Campos não suportados (não há state, delete ou labels)')
        number = item.get('number')
        if number is not None and (type(number) is not int or number <= 0):
            raise Conflict('Número inválido')
        if not number:
            matches = api.find(kind, changes['title'])
            if len(matches) > 1:
                raise Conflict('Título ambíguo; informar number')
            number = matches[0]['number'] if matches else None
        before = api.read(kind, number) if number else None
        target = (kind, number if number else changes.get('title'))
        if target in targets:
            raise Conflict('Objeto repetido no mesmo plano')
        targets.add(target)
        text_field = 'body' if kind == 'issues' else 'description'
        if before and text_field in changes:
            raise Conflict('Texto existente só pode ser editado via planning, preservando corpo manual')
        if 'planning' in changes:
            changes[text_field] = managed(before.get(text_field) if before else changes.get(text_field), changes.pop('planning'))
        if 'title' in changes and not isinstance(changes['title'], str):
            raise Conflict('Título inválido')
        plan['operations'].append({'id': item['id'], 'kind': kind, 'number': number,
                                   'before': before, 'desired': changes})
    return plan


def matches(obj, desired, kind):
    actual = fields(obj, kind)
    return all(actual[key] == value for key, value in desired.items())


def apply(plan, state, api, limit, recover=False):
    if not 1 <= limit <= 12:
        raise Conflict('Lote precisa estar entre 1 e 12')
    path = state / 'journal.json'
    journal = json.loads(path.read_text()) if path.exists() else {'plan_hash': digest(plan), 'objects': {}}
    if journal['plan_hash'] != digest(plan):
        raise Conflict('Plano mudou; usar diretório de estado novo')
    writes = 0
    for op in plan['operations']:
        key, kind = op['id'], op['kind']
        record = journal['objects'].get(key)
        if recover:
            if not record:
                continue
            if record['status'] == 'intent':
                if not record['number']:
                    raise Conflict('Criação incerta: retomar/conferir antes da recuperação')
                observed = api.read(kind, record['number'])
                if fields(observed, kind) == fields(record['before'], kind):
                    record.update(status='restored', recovered_after=observed)
                    save(path, journal)
                    continue
                if matches(observed, record['desired'], kind) or (
                    record.get('after') and fields(observed, kind) == fields(record['after'], kind)
                ):
                    record.update(status='done', after=observed)
                    save(path, journal)
                else:
                    raise Conflict('Falha parcial não observada/intervenção manual; conferir antes de recuperar')
            if record['status'] == 'restored' or record['before'] is None:
                continue  # Criações ficam preservadas: recuperação nunca deleta.
            restore = {field: fields(record['before'], kind)[field] for field in record['desired']}
            current = api.read(kind, record['number'])
            if matches(current, restore, kind) and record.get('recovery_intent'):
                record['status'] = 'restored'
                record['recovered_after'] = current
                save(path, journal)
                continue
            if fields(current, kind) != fields(record['after'], kind):
                raise Conflict(f'{key}: intervenção manual após publicação; recuperação recusada')
            if matches(current, restore, kind):
                continue
            record['recovery_intent'] = restore
            save(path, journal)
            if writes >= limit:
                break
            api.write(kind, record['number'], restore)
            writes += 1
            after = api.read(kind, record['number'])
            if not matches(after, restore, kind):
                raise Conflict(f'{key}: readback de recuperação divergiu')
            record.update(status='restored', recovered_after=after)
            save(path, journal)
            continue
        if record:
            if record['status'] == 'restored':
                raise Conflict('Plano recuperado não pode ser reaplicado; preparar novo estado')
            number = record['number']
            if number:
                current = api.read(kind, number)
            else:
                found = api.find(kind, record['desired']['title'])
                if len(found) != 1:
                    raise Conflict(f'{key}: criação incerta; conferir remoto, não repetir POST')
                current = found[0]
                record['number'] = current['number']
            if record['status'] == 'done' and fields(current, kind) != fields(record['after'], kind):
                raise Conflict(f'{key}: alteração posterior ao readback')
            if matches(current, record['desired'], kind):
                if record['before']:
                    expected = {**fields(record['before'], kind), **record['desired']}
                    if fields(current, kind) != expected:
                        raise Conflict(f'{key}: campo manual divergente durante retomada')
                record.update(status='done', after=current)
                save(path, journal)
                continue
            if record['status'] == 'done' or fields(current, kind) != fields(record['before'], kind):
                raise Conflict(f'{key}: conflito com snapshot/journal')
        else:
            number = op['number']
            current = api.read(kind, number) if number else None
            if current and fields(current, kind) != fields(op['before'], kind):
                raise Conflict(f'{key}: conflito com snapshot preparado')
            if not number and api.find(kind, op['desired']['title']):
                raise Conflict(f'{key}: título apareceu após preparação; revisar novo plano')
            record = copy.deepcopy(op)
            record['status'] = 'intent'
            journal['objects'][key] = record
            if current and matches(current, op['desired'], kind):
                record.update(status='done', after=current)
                save(path, journal)
                continue
        if writes >= limit:
            break
        save(path, journal)  # Intenção persistida ANTES da chamada mutável.
        response = api.write(kind, record['number'], record['desired'])
        record['number'] = response['number']
        save(path, journal)
        writes += 1
        after = api.read(kind, record['number'])
        record['after'] = after
        save(path, journal)
        if not matches(after, record['desired'], kind):
            raise Conflict(f'{key}: readback divergiu; conferir antes de retomar')
        record['status'] = 'done'
        save(path, journal)
    return {'writes': writes, 'objects': journal['objects']}


def recovery_preview(plan, state):
    journal = json.loads((state / 'journal.json').read_text())
    if journal['plan_hash'] != digest(plan):
        raise Conflict('Plano mudou; recuperação recusada')
    operations = []
    for record in journal['objects'].values():
        action = {'id': record['id'], 'kind': record['kind'], 'number': record['number']}
        if record['before'] is None:
            action['action'] = 'preserve_creation_no_delete'
        else:
            action.update(action='restore_written_fields',
                          restore={key: fields(record['before'], record['kind'])[key] for key in record['desired']},
                          expected_after=record.get('after'), status=record['status'])
        operations.append(action)
    return {'repo': plan['repo'], 'operations': operations}


@contextlib.contextmanager
def locked(state):
    state.mkdir(parents=True, exist_ok=True)
    with (state / 'lock').open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', type=Path)
    parser.add_argument('--state', type=Path, default=Path('.planning-state'))
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--recover', action='store_true')
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    if args.apply and args.spec:
        parser.error('--apply usa o plano preparado; não aceita --spec')
    if args.apply and (args.limit is None or not 1 <= args.limit <= 12):
        parser.error('--apply exige --limit de 1 a 12')
    with locked(args.state):
        path = args.state / 'plan.json'
        if args.apply or args.recover:
            plan = json.loads(path.read_text())
        elif path.exists():
            plan = json.loads(path.read_text())
            if args.spec and plan['spec_hash'] != digest(json.loads(args.spec.read_text())):
                raise Conflict('Spec mudou; usar diretório de estado novo')
        else:
            if not args.spec:
                parser.error('--spec é obrigatório ao preparar estado novo')
            spec = json.loads(args.spec.read_text())
            plan = prepare(spec, GitHub(spec['repo']))
            save(path, plan)
        if args.apply:
            print(json.dumps(apply(plan, args.state, GitHub(plan['repo']), args.limit, args.recover), ensure_ascii=False, indent=2))
        else:
            print(json.dumps({'mode': 'recovery-preview' if args.recover else 'dry-run', 'remote_writes': 0, 'plan': recovery_preview(plan, args.state) if args.recover else plan}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
