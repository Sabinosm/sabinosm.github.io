// guardarPagina.js
//
// Entrada para páginas que têm bootstrap PRÓPRIO e só precisam do
// guarda de acesso (e, junto, do monitor de sessão). Uso, no <head>, logo depois do preferenciasLoader
// e ANTES de qualquer outro <script type="module"> (módulos executam
// na ordem em que aparecem no documento):
//
//   <script type="module" src="../../../../js/pages/auth/guardarPagina.js"></script>
//   ...
//   <body data-requer="gerenciar">
//
// Se o acesso for negado, a página é escondida e o navegador segue
// para 401/403. Módulos da página que se iniciam sozinhos ainda podem
// disparar requisições antes da navegação concluir -- o back as
// recusa; para evitá-las de vez, o módulo pode checar `acesso.ok`:
//
//   import { acesso } from ".../guardarPagina.js";
//   if (!acesso.ok) throw new Error("acesso negado");  // ou return

import { exigirAcesso } from "./acesso.js";
import { iniciarMonitoramentoSessao } from "../pages/auth/watchSession.js";

export const acesso = exigirAcesso();

// O monitor de sessão (e a reconciliação de perfil) é ligado AQUI, não
// nas páginas: elas não precisam importar nada. É idempotente, então
// não faz mal se a página ainda chamar iniciarMonitoramentoSessao().
if (acesso.ok) iniciarMonitoramentoSessao({ verificarAgora: true });