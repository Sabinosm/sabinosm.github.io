//
// Aviso informativo sobre fator único de autenticação. Exportado à
// parte porque é usado tanto pelo orquestrador (preencherPerfil.js)
// quanto pelos handlers de TOTP (helpers/totp.js).

/**
 * ALTERADO: substitui atualizarAvisoRedundancia2fa (versão anterior,
 * baseada no conceito de "2FA vira obrigatório com 2+ fatores", que
 * não existe mais -- ver mfa.py). 2FA já é sempre obrigatório desde o
 * onboarding, então não há mais nada a "ativar" cadastrando um segundo
 * fator.
 *
 * O que ainda vale avisar: se o usuário tem EXATAMENTE 1 fator (1
 * WebAuthn XOR TOTP confirmado), esse é o único que existe -- o
 * backend bloqueia removê-lo sem antes cadastrar outro (ver
 * webauthn_2fa.py::remover_credencial e totp_2fa.py::remover_totp,
 * ambos retornam 409 nesse caso). O aviso aqui é só informativo, o
 * bloqueio de verdade acontece no backend -- mas evita o usuário
 * clicar em "Remover" sem saber por que vai falhar.
 */
export function atualizarAvisoUnicoFator(webauthn, totp) {
  const aviso = document.getElementById('aviso-unico-fator');
  if (!aviso) return;

  const qtdWebauthn = webauthn?.credenciais?.length ?? 0;
  const temTotp = Boolean(totp?.confirmado);
  const totalFatores = qtdWebauthn + (temTotp ? 1 : 0);

  const exatamenteUmFator = totalFatores === 1;

  aviso.hidden = !exatamenteUmFator;
  if (exatamenteUmFator) {
    aviso.textContent = temTotp
      ? 'Este é seu único método de confirmação em duas etapas. Para removê-lo, cadastre antes uma chave de segurança (WebAuthn).'
      : 'Este é seu único método de confirmação em duas etapas. Para removê-lo, cadastre antes o aplicativo autenticador.';
  }
}