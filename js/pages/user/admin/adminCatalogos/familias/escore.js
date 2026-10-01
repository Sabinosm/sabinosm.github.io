// familias/escore.js
//
// Adaptador do escore NEWS2. A rota de campos existe SÓ para o NEWS2
// (/news2/<uuid>/campos), por isso o adaptador se aplica pela sigla -- e não
// por tipo_protocolo: outros escores ponderados ainda caem no adaptador
// "sem suporte" até ganharem rota própria.
//
// Contrato de um adaptador (ver familias/index.js):
//   aplicaA(protocolo) -> boolean
//   carregar(uuid)     -> Promise<{ campos: Campo[] | null, aviso?, dados? }>
//   renderizarExtras?(container, dados)  -- seção própria da família (opcional)

import { buscarCamposNews2 } from "../adminCatalogosApi.js";
import { campoDeLista } from "../adminCatalogosCampos.js";

export default {
  nome: 'escore-news2',

  aplicaA(protocolo) {
    return String(protocolo.sigla ?? '').toUpperCase() === 'NEWS2';
  },

  async carregar(uuid) {
    const resposta = await buscarCamposNews2(uuid);
    return { campos: (resposta.data ?? []).map(campoDeLista) };
  },
};