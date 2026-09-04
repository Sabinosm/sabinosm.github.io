// userCache.js
//
// Única porta de leitura/escrita do snapshot de dados do usuário
// guardado em sessionStorage sob a chave USER_CACHE_KEY.
//
// Por quê este módulo existe:
// sessionStorage['bion-dados-usuario'] é escrito uma vez, por
// afterLogin.js, logo após o /me do login. initHomePage.js lê esse
// mesmo valor em toda navegação de página e passa pra
// preencherPainelPerfil.js, que trata como fonte de verdade pra
// popular a UI (inclusive tema, ver preencherTema em
// preencherPerfil.js, que também escreve em localStorage a partir
// dele).
//
// Isso significa que QUALQUER mudança salva com sucesso na API
// depois do login (tema, tamanho de fonte, idioma, nome, telefone,
// etc.) precisa também ser refletida nesse snapshot -- senão a
// próxima navegação de página lê o valor velho do login e "desfaz"
// visualmente a mudança (ela continua salva no backend, só não
// aparece até o próximo login). Foi exatamente o bug observado com
// o tema antes deste módulo existir: localStorage era atualizado no
// save, mas sessionStorage não, e preencherTema() sobrescrevia o
// localStorage de volta com o valor velho do sessionStorage na
// página seguinte.
//
// Qualquer código que salvar algo com sucesso na API e que também
// exista no payload de /me deve chamar atualizarDadosUsuarioCache()
// logo em seguida, em vez de mexer em sessionStorage diretamente.

export const USER_CACHE_KEY = 'bion-dados-usuario';

/**
 * Lê e faz parse do snapshot atual. Retorna null se não existir ou
 * se estiver corrompido (não deveria acontecer, mas sessionStorage
 * pode ser editado manualmente/por extensões).
 */
export function lerDadosUsuarioCache() {
  const bruto = sessionStorage.getItem(USER_CACHE_KEY);
  if (!bruto) return null;

  try {
    return JSON.parse(bruto);
  } catch (erro) {
    console.error('userCache: sessionStorage corrompido, ignorando', erro);
    return null;
  }
}

/**
 * Merge profundo simples: percorre as chaves de `patch` e sobrescreve
 * em `alvo`, descendo recursivamente em objetos simples (não-array).
 * Arrays e valores primitivos são substituídos inteiros, não
 * mesclados -- suficiente para o formato de /me (design, preferencias
 * etc. são objetos planos; linguagem é array mas sempre enviado
 * completo).
 */
function mesclarProfundo(alvo, patch) {
  Object.entries(patch).forEach(([chave, valor]) => {
    const ehObjetoSimples = v => v !== null && typeof v === 'object' && !Array.isArray(v);

    if (ehObjetoSimples(valor) && ehObjetoSimples(alvo[chave])) {
      mesclarProfundo(alvo[chave], valor);
    } else {
      alvo[chave] = valor;
    }
  });
  return alvo;
}

/**
 * Aplica `patch` por cima do snapshot atual e regrava no
 * sessionStorage. Usa merge profundo, então chamar com
 * { configuracoes: { design: { tema: 'dark' } } } atualiza só
 * configuracoes.design.tema, preservando o resto de configuracoes
 * (tamanho_fonte, preferencias, etc.) e do payload (usuario,
 * webauthn).
 *
 * Não faz nada (e loga) se não houver snapshot ainda -- não deveria
 * acontecer em uso normal, já que qualquer tela que permite salvar
 * configurações só é alcançável depois do login, que é quem cria o
 * snapshot original.
 */
export function atualizarDadosUsuarioCache(patch) {
  const dados = lerDadosUsuarioCache();
  if (!dados) {
    console.error('userCache: tentativa de atualizar cache inexistente, ignorando patch', patch);
    return null;
  }

  mesclarProfundo(dados, patch);

  try {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(dados));
  } catch (erro) {
    // sessionStorage cheio ou indisponível -- não é fatal, só significa
    // que a próxima navegação pode não refletir esta mudança até o
    // próximo /me. Loga pra facilitar debug se acontecer.
    console.error('userCache: falha ao gravar sessionStorage', erro);
  }

  return dados;
}

/**
 * Grava o payload de /me pela primeira vez na sessão -- usado só por
 * afterLogin.js, logo após o fetch de /me no fluxo pós-login.
 *
 * Diferente de atualizarDadosUsuarioCache (que faz merge por cima do
 * que já existe), esta função SUBSTITUI o snapshot inteiro -- é a
 * origem do cache, não uma atualização parcial. Não valida o shape
 * do payload; quem chama (afterLogin.js) já confia na resposta de
 * /me.
 */
export function definirDadosUsuarioCache(payloadCompleto) {
  try {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(payloadCompleto));
  } catch (erro) {
    console.error('userCache: falha ao gravar snapshot inicial em sessionStorage', erro);
  }
}

// ============================================
// Helpers de propósito específico, um por seção do payload de /me
// (ver UsuarioModel.to_dict, ConfiguracaoModel.to_dict,
// CredencialWebauthnModel.to_dict no backend).
//
// Por quê ter isso além de atualizarDadosUsuarioCache genérico:
// cada tela que salva algo hoje monta o patch olhando pra estrutura
// interna do payload (dados.usuario.telefone, dados.configuracoes.
// design.tema, etc.). Se essa estrutura mudar no backend (ex: campo
// renomeado, seção reorganizada), toda tela que monta patch na mão
// precisa ser encontrada e corrigida.
//
// Com um helper por seção, só ESTE arquivo conhece o formato exato
// -- quem chama passa um objeto "plano" com o que mudou, sem se
// preocupar em replicar dados.configuracoes.design.tema = ... .
// Migrar uma tela existente vira trocar a leitura/escrita direta de
// sessionStorage por uma chamada a um destes helpers, sem reescrever
// a lógica de negócio da tela.
// ============================================

/**
 * Atualiza campos de dados.usuario (nome, telefone, etc -- ver
 * UsuarioModel.to_dict). Aceita um patch parcial: só os campos
 * passados são sobrescritos.
 *
 * Ex: atualizarUsuarioCache({ telefone: '11999999999' })
 */
export function atualizarUsuarioCache(patchUsuario) {
  return atualizarDadosUsuarioCache({ usuario: patchUsuario });
}

/**
 * Atualiza campos de dados.configuracoes.design (tema,
 * tamanho_fonte -- ver ConfiguracaoModel.to_dict).
 *
 * Ex: atualizarDesignCache({ tema: 'dark' })
 */
export function atualizarDesignCache(patchDesign) {
  return atualizarDadosUsuarioCache({ configuracoes: { design: patchDesign } });
}

/**
 * Atualiza campos de dados.configuracoes.preferencias (linguagem
 * -- ver ConfiguracaoModel.to_dict).
 *
 * Ex: atualizarPreferenciasCache({ linguagem: ['en-US'] })
 */
export function atualizarPreferenciasCache(patchPreferencias) {
  return atualizarDadosUsuarioCache({ configuracoes: { preferencias: patchPreferencias } });
}

/**
 * Substitui a lista inteira de credenciais WebAuthn
 * (dados.webauthn.credenciais -- ver CredencialWebauthnModel.to_dict).
 * Diferente dos outros helpers, aqui é substituição total da lista,
 * não merge por chave -- não faz sentido mesclar arrays de
 * credenciais por índice. Quem chama monta a lista completa
 * atualizada (ex: resposta do POST de adicionar dispositivo, ou a
 * lista filtrada depois de um DELETE).
 *
 * Ex: atualizarCredenciaisWebauthnCache(novaListaCompleta)
 */
export function atualizarCredenciaisWebauthnCache(novaListaCredenciais) {
  const dados = lerDadosUsuarioCache();
  if (!dados) {
    console.error('userCache: tentativa de atualizar credenciais em cache inexistente');
    return null;
  }
  // Substituição direta, não merge -- ver nota acima.
  dados.webauthn = dados.webauthn ?? {};
  dados.webauthn.credenciais = novaListaCredenciais;

  try {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(dados));
  } catch (erro) {
    console.error('userCache: falha ao gravar sessionStorage', erro);
  }

  return dados;
}