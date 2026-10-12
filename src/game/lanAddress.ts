/**
 * Endereço para convidar jogadores da mesma rede (#192). Dentro do Docker o servidor só enxerga o IP interno do container
 * (ex.: 172.17.0.2), que não existe na rede da casa; por isso o link vem, em ordem: do host com que a página foi aberta
 * (se não for o próprio aparelho), do `LAN_HOST` informado ao subir o servidor ou dos IPs reais da máquina. Sem endereço
 * confiável, não há link: o lobby explica como descobrir o IP. Regra pura, sem DOM nem `os`.
 */

/** Endereços que só valem no próprio aparelho. */
export const isLoopbackHost = (host: string): boolean => {
  const h = host.trim().toLowerCase();
  return h === 'localhost' || h === '::1' || h === '[::1]' || h === '0.0.0.0' || h.startsWith('127.') || h === '';
};

interface NetworkInterfaceLike { family: string | number; internal: boolean; address: string }

/**
 * IPs que o servidor anuncia: `LAN_HOST` quando informado; dentro de container, nenhum (o IP visto lá dentro é interno);
 * fora dele, os IPv4 não internos da máquina.
 */
export function lanAddresses(options: {
  lanHost?: string;
  inContainer: boolean;
  interfaces: Record<string, NetworkInterfaceLike[] | undefined>;
}): string[] {
  const configured = options.lanHost?.trim();
  if (configured) return [configured];
  if (options.inContainer) return [];
  const addresses: string[] = [];
  for (const list of Object.values(options.interfaces)) {
    for (const iface of list ?? []) {
      if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal && !isLoopbackHost(iface.address)) addresses.push(iface.address);
    }
  }
  return addresses;
}

/** Link de convite, ou `null` quando não há endereço alcançável conhecido. */
export function lanShareUrl(options: { pageHost: string; pagePort?: string; serverIps: readonly string[]; serverPort?: number }): string | null {
  const port = options.pagePort || String(options.serverPort ?? 3000);
  if (!isLoopbackHost(options.pageHost)) return `http://${options.pageHost}:${port}`;
  const ip = options.serverIps.find((candidate) => !isLoopbackHost(candidate));
  return ip ? `http://${ip}:${port}` : null;
}
