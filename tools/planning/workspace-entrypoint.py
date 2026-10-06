"""Encaminhamento seguro da entrada antiga do workspace para código versionado."""
from pathlib import Path
import runpy

source = Path(__file__).resolve()
target = next((parent / 'repos/terrinha/tools/planning/publish-entrega.py'
               for parent in source.parents
               if (parent / 'repos/terrinha/tools/planning/publish-entrega.py').is_file()),
              source.with_name('publish-entrega.py'))
if target.resolve() == source or not target.is_file():
    raise RuntimeError('Publicador versionado não encontrado; nenhuma chamada remota executada')
runpy.run_path(str(target), run_name='__main__')
