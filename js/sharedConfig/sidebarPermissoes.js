// sharedConfig/loaders/sidebarPermissoes.js
//
// Filtra a sidebar única pelas capacidades do usuário. Cada item do
// sidebar.html declara data-requer="cap1,cap2" (OU lógico).
//
// Chame ANTES de inserir o fragmento no DOM, pra não piscar itens
// que o usuário não pode ver:
//
//   const frag = document.createRange().createContextualFragment(html);
//   aplicarPermissoesSidebar(frag);
//   container.appendChild(frag);
//
// Isto é só UX. Quem autoriza de verdade são os decorators do back.

import { getPermissoes, temAlguma } from './userCacheHelpers/userCachePermissoes.js';
import { homePara } from './loaders/rotas.js';

export function aplicarPermissoesSidebar(raiz = document) {
  const p = getPermissoes();

  // FALHA FECHADA: todo item de navegação ([data-nav]) precisa declarar
  // data-requer. Sem o atributo, temAlguma() recebe zero capacidades,
  // devolve false e o item é removido -- esquecer o atributo esconde o
  // item em vez de mostrá-lo a todos.
  raiz.querySelectorAll('[data-nav]').forEach(item => {
    const capacidades = (item.dataset.requer ?? '')
      .split(',').map(s => s.trim()).filter(Boolean);

    if (!temAlguma(p, ...capacidades)) item.remove();
  });

  // O item de início aponta para a home DO USUÁRIO (as homes diferem
  // por perfil; as demais páginas são compartilhadas).
  const inicio = raiz.querySelector('[data-nav="gerenciamento"]');
  const destino = homePara(p);
  if (inicio && destino) inicio.setAttribute('href', destino);
}