// catalogosSessao.js
//
// TRANSITÓRIO: camada de compatibilidade (mesmo padrão de
// adminProfissionaisSessao.js). Os nomes continuam os mesmos, mas a
// regra de papel vive só em userCachePermissoes.js.
//
// Na página de catálogo só souAdmin() decide uma OPÇÃO (controle de
// liberação institucional). Ler o catálogo e o detalhe é aberto a
// qualquer usuário logado. souProfissionalDeSaude() não é usado aqui;
// segue exportado para a página de consultas reaproveitar.
// A autorização real continua no back; no front é só renderização.

import { getPermissoes } from "../../../../sharedConfig/userCacheHelpers/userCachePermissoes.js";

/** true se o usuário logado é admin (comum ou super). */
export const souAdmin = () => getPermissoes().gerenciar;

/** true se o usuário logado é médico ou enfermeiro. */
export const souProfissionalDeSaude = () => getPermissoes().atenderClinicamente;