//
// Preenche os campos de identidade do usuário na sidebar e no modal:
// avatar (iniciais), nome, telefone e dados institucionais (CRM,
// e-mail, login).

function iniciais(nomeCompleto) {
  if (!nomeCompleto) return '';
  const partes = nomeCompleto.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

export function preencherIdentidade(usuario) {
  const sigla = iniciais(usuario.nome_completo);

  const navAvatar = document.getElementById('nav-avatar-iniciais');
  const navNome = document.getElementById('nav-nome-usuario');
  const userAvatar = document.getElementById('user-avatar-iniciais');
  const fNome = document.getElementById('f-nome');
  const fTelefone = document.getElementById('f-telefone');

  if (navAvatar) navAvatar.textContent = sigla;
  if (navNome) navNome.textContent = usuario.nome_completo ?? '';
  if (userAvatar) userAvatar.textContent = sigla;
  if (fNome) fNome.value = usuario.nome_completo ?? '';
  if (fTelefone) fTelefone.value = usuario.telefone ?? '';
}

export function preencherDadosInstitucionais(usuario) {
  const crm = document.getElementById('user-crm');
  const email = document.getElementById('user-email');
  const login = document.getElementById('user-login');

  // CRM não está no dict de usuário atual (to_dict não lista esse
  // campo) -- deixa só a tag institucional até existir no backend.
  // Ajuste aqui quando o campo for exposto.
  if (crm && usuario.crm) {
    crm.prepend(document.createTextNode(usuario.crm + ' '));
  }

  if (email) email.prepend(document.createTextNode((usuario.email ?? '') + ' '));
  if (login) login.textContent = usuario.user_login ?? '';
}