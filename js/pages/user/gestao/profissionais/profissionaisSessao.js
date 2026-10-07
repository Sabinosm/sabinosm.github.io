// profissionaisSessao.js
//
// TRANSITÓRIO: camada de compatibilidade. Mantém os nomes que
// adminProfissionaisModal.js / adminProfissionaisLista.js (e o cadastro
// de paciente) já importam, mas agora TODOS delegam a
// userCachePermissoes.js -- nenhuma regra de papel mora mais aqui.
//
// Quando cada chamador passar a usar getPermissoes() direto, apague
// o export correspondente; quando esvaziar, apague o arquivo.
//
//   souAdmin()              -> getPermissoes().gerenciar
//   souSuperAdmin()         -> getPermissoes().gerenciarAdmins
//   souProfissionalDeSaude  -> getPermissoes().atenderClinicamente
//   meuUuid()               -> lerUuidUsuarioCache()  (identidade)

import { getPermissoes } from "../../../../sharedConfig/userCacheHelpers/userCachePermissoes.js";
import { lerUuidUsuarioCache } from "../../../../sharedConfig/userCacheHelpers/userCacheUsuario.js";

/** true se o usuário logado é o administrador principal (fundador) da empresa. */
export const souSuperAdmin = () => getPermissoes().gerenciarAdmins;

/** true se o usuário logado é admin (comum ou super). */
export const souAdmin = () => getPermissoes().gerenciar;

/** true se o usuário logado é médico ou enfermeiro. Continua valendo
 * para médico-admin: is_admin e funcao_clinica são ortogonais. */
export const souProfissionalDeSaude = () => getPermissoes().atenderClinicamente;

/** uuid do usuário logado, ou null se a sessão não estiver disponível. */
export const meuUuid = () => lerUuidUsuarioCache();