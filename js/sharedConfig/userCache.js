// userCache.js
//
// Ponto único de entrada do snapshot de dados do usuário guardado em
// sessionStorage sob a chave USER_CACHE_KEY. Este arquivo só
// reexporta -- a implementação está dividida em userCacheHelpers/,
// um módulo por responsabilidade:
//
//   userCacheHelpers/userCacheCore.js
//     Leitura, merge profundo genérico, escrita (patch e
//     substituição total de seção) e a gravação inicial do snapshot
//     (definirDadosUsuarioCache, usada só por afterLogin.js).
//
//   userCacheHelpers/userCacheUsuario.js
//     dados.usuario (nome, telefone, etc).
//
//   userCacheHelpers/userCacheConfiguracoes.js
//     dados.configuracoes.design e dados.configuracoes.preferencias.
//
//   userCacheHelpers/userCacheWebauthn.js
//     dados.webauthn.credenciais (substituição total da lista).
//
//   userCacheHelpers/userCacheTotp.js
//     dados.totp (substituição total do objeto/null).
//
// Por quê este módulo existe (contexto completo, não repetido nos
// arquivos filhos):
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
// exista no payload de /me deve usar um dos helpers abaixo (ou
// atualizarDadosUsuarioCache, se não houver um específico ainda) em
// vez de mexer em sessionStorage diretamente.
//

export {
  USER_CACHE_KEY,
  lerDadosUsuarioCache,
  atualizarDadosUsuarioCache,
  definirDadosUsuarioCache,
} from './userCacheHelpers/userCacheCore.js';

export { atualizarUsuarioCache } from './userCacheHelpers/userCacheUsuario.js';

export {
  atualizarDesignCache,
  atualizarPreferenciasCache,
} from './userCacheHelpers/userCacheConfiguracoes.js';

export { atualizarCredenciaisWebauthnCache } from './userCacheHelpers/userCacheWebauthn.js';

export { atualizarTotpCache } from './userCacheHelpers/userCacheTotp.js';