// userCacheHelpers/userCacheCore.js
//
// Núcleo do snapshot de dados do usuário guardado em sessionStorage
// sob a chave USER_CACHE_KEY: leitura, merge profundo genérico e as
// duas formas de escrita (substituição total / patch por cima).
//
// Por quê este módulo existe (contexto completo em userCache.js, que
// reexporta tudo isto):
// sessionStorage['bion-dados-usuario'] é escrito uma vez, por
// afterLogin.js, logo após o /me do login. initHomePage.js lê esse
// mesmo valor em toda navegação de página e passa pra
// preencherPainelPerfil.js, que trata como fonte de verdade pra
// popular a UI. Qualquer mudança salva com sucesso na API depois do
// login precisa também ser refletida nesse snapshot -- senão a
// próxima navegação "desfaz" visualmente a mudança até o próximo
// login.
//
// Os helpers de propósito específico (userCacheUsuario.js,
// userCacheConfiguracoes.js, userCacheWebauthn.js, userCacheTotp.js)
// usam `lerDadosUsuarioCache` e `atualizarDadosUsuarioCache` daqui
// como base -- eles não leem/escrevem sessionStorage diretamente,
// exceto os dois casos de substituição total de seção (webauthn,
// totp), que precisam do padrão de escrita definido aqui mas não do
// merge por patch (ver comentário em cada um sobre por quê).

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
 * Grava `dados` (já mutado/montado por quem chama) de volta no
 * sessionStorage. Helper interno de baixo nível compartilhado por
 * atualizarDadosUsuarioCache e pelos helpers de substituição total de
 * seção (webauthn, totp) -- centraliza o try/catch de escrita, que é
 * idêntico nos dois casos.
 */
function gravarSnapshot(dados) {
  try {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(dados));
  } catch (erro) {
    // sessionStorage cheio ou indisponível -- não é fatal, só significa
    // que a próxima navegação pode não refletir esta mudança até o
    // próximo /me. Loga pra facilitar debug se acontecer.
    console.error('userCache: falha ao gravar sessionStorage', erro);
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
  gravarSnapshot(dados);

  return dados;
}

/**
 * Substitui inteiramente `dados[chave]` (sem merge) e regrava.
 * Usado pelos helpers de seção que representam substituição total
 * (webauthn.credenciais, totp) em vez de patch parcial -- ver
 * userCacheWebauthn.js e userCacheTotp.js para o porquê de cada um
 * precisar disso em vez de atualizarDadosUsuarioCache.
 *
 * Retorna null (e loga) se não houver snapshot ainda, mesmo padrão
 * de atualizarDadosUsuarioCache.
 */
export function substituirSecaoCache(chave, valor) {
  const dados = lerDadosUsuarioCache();
  if (!dados) {
    console.error(`userCache: tentativa de atualizar "${chave}" em cache inexistente`);
    return null;
  }

  dados[chave] = valor;
  gravarSnapshot(dados);

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