export type DeveloperCommand =
  | { type: 'help' }
  | { type: 'resources_max' }
  | { type: 'voyage_scenario' }
  | { type: 'island'; index: number }
  | { type: 'reveal'; enabled: boolean }
  | { type: 'spawn'; unit: 'villager' | 'soldier' | 'cavalry' | 'trade_boat' | 'fishing_boat' | 'warship'; count: number }
  | { type: 'status' };

export type DeveloperCommandParseResult =
  | { ok: true; command: DeveloperCommand }
  | { ok: false; error: string };

/** Parses only documented local test commands; input is never evaluated as code. */
export function parseDeveloperCommand(input: string, islandCount: number): DeveloperCommandParseResult {
  const parts = input.trim().toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'Digite um comando. Use “ajuda” para ver as opções.' };

  const [root, ...args] = parts;
  if (root === 'ajuda' || root === 'help') {
    return args.length === 0 ? { ok: true, command: { type: 'help' } } : { ok: false, error: 'Uso: ajuda' };
  }
  if (root === 'recursos' || root === 'resources') {
    return args.length === 1 && args[0] === 'max'
      ? { ok: true, command: { type: 'resources_max' } }
      : { ok: false, error: 'Uso: recursos max' };
  }
  if (root === 'viagem' || (root === 'scenario' && args[0] === 'voyage')) {
    return args.length === (root === 'scenario' ? 1 : 0)
      ? { ok: true, command: { type: 'voyage_scenario' } }
      : { ok: false, error: 'Uso: viagem' };
  }
  if (root === 'ilha' || root === 'island') {
    const index = Number(args[0]);
    return args.length === 1 && Number.isInteger(index) && index >= 1 && index <= islandCount
      ? { ok: true, command: { type: 'island', index } }
      : { ok: false, error: `Uso: ilha 1-${islandCount}` };
  }
  if (root === 'revelar' || root === 'reveal') {
    const value = args[0];
    return args.length === 1 && (value === 'on' || value === 'off')
      ? { ok: true, command: { type: 'reveal', enabled: value === 'on' } }
      : { ok: false, error: 'Uso: revelar on|off' };
  }
  if (root === 'status') {
    return args.length === 0 ? { ok: true, command: { type: 'status' } } : { ok: false, error: 'Uso: status' };
  }
  if (root === 'aldeoes' || root === 'villagers') {
    const count = args.length === 0 ? 3 : Number(args[0]);
    return args.length <= 1 && Number.isInteger(count) && count >= 1 && count <= 8
      ? { ok: true, command: { type: 'spawn', unit: 'villager', count } }
      : { ok: false, error: 'Uso: aldeoes [1-8]' };
  }
  if (root === 'barco') {
    return args.length === 0 || (args.length === 1 && args[0] === 'transporte')
      ? { ok: true, command: { type: 'spawn', unit: 'trade_boat', count: 1 } }
      : { ok: false, error: 'Uso: barco [transporte]' };
  }
  if (root === 'spawn' && args.length >= 1 && args.length <= 2) {
    const aliases: Record<string, string> = {
      villager: 'villager', aldeao: 'villager', aldeaoes: 'villager',
      soldier: 'soldier', soldado: 'soldier', cavalry: 'cavalry', cavalaria: 'cavalry',
      transport: 'trade_boat', trade_boat: 'trade_boat', pesca: 'fishing_boat', fishing_boat: 'fishing_boat',
      warship: 'warship', guerra: 'warship',
    };
    const unit = aliases[args[0]];
    const count = args.length === 1 ? 1 : Number(args[1]);
    if (unit && Number.isInteger(count) && count >= 1 && count <= 8) {
      return { ok: true, command: { type: 'spawn', unit: unit as Extract<DeveloperCommand, { type: 'spawn' }>['unit'], count } };
    }
    return { ok: false, error: 'Uso: spawn aldeao|soldado|cavalaria|transport|pesca|warship [1-8]' };
  }

  return { ok: false, error: `Comando desconhecido: ${root}. Digite “ajuda”.` };
}

export const DEVELOPER_COMMAND_HELP = [
  'ajuda                 lista os comandos disponíveis',
  'recursos max          libera recursos para a partida solo',
  'aldeoes [1-8]         cria aldeões na base',
  'barco [transporte]    cria um barco de transporte na costa',
  'spawn soldado [n]     cria unidades para testes',
  'viagem                prepara barco + 3 aldeões junto à costa',
  'ilha [1-6]            move a câmera para outra ilha e revela o mapa',
  'revelar on|off        liga ou desliga a visão total de teste',
  'status                mostra um resumo da partida',
].join('\n');
