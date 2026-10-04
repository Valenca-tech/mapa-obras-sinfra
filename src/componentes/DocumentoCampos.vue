<script setup>
// Campos do documento de suporte (protocolo para auditoria).
// Sem número e protocolo, o ato fica registrado como "documento pendente".
// "travados": campos já registrados no banco, que não se trocam (o banco recusa).
import { computed } from 'vue';
import { estado } from '../estado.js';

const doc = defineModel({ type: Object, required: true });
const props = defineProps({
  titulo: { type: String, default: 'Documento de suporte' },
  travados: { type: Array, default: () => [] },
});

const travado = (campo) => props.travados.includes(campo);
const completo = computed(() => !!(doc.value.numero?.trim() && doc.value.numero_protocolo?.trim()));
</script>

<template>
  <fieldset class="documento">
    <legend>{{ titulo }}</legend>
    <p v-if="travados.length" class="documento__aviso">
      Os campos já registrados ficam bloqueados: o documento de um ato não se reescreve. Preencha os que faltam.
    </p>
    <div class="grade documento__grade">
      <label class="campo">
        <span>Tipo</span>
        <select v-model="doc.tipo" :disabled="travado('tipo')">
          <option v-for="t in estado.tiposDocumento" :key="t.codigo" :value="t.codigo">{{ t.nome }}</option>
        </select>
      </label>
      <label class="campo">
        <span>Número do documento</span>
        <input v-model="doc.numero" type="text" placeholder="Ex.: 012/2026" :readonly="travado('numero')" />
      </label>
      <label class="campo">
        <span>Número de protocolo</span>
        <input v-model="doc.numero_protocolo" type="text" placeholder="Ex.: 2026/000123" :readonly="travado('numero_protocolo')" />
      </label>
      <label class="campo">
        <span>Data do protocolo</span>
        <input
          v-model="doc.data_protocolo"
          type="date"
          min="2000-01-01"
          :max="estado.hoje"
          :readonly="travado('data_protocolo')"
        />
      </label>
      <label class="campo">
        <span>Órgão ou setor de origem</span>
        <input v-model="doc.orgao_origem" type="text" placeholder="Ex.: SINFRA, Procuradoria" :readonly="travado('orgao_origem')" />
      </label>
      <label class="campo">
        <span>Nº do processo administrativo</span>
        <input v-model="doc.numero_processo" type="text" :readonly="travado('numero_processo')" />
      </label>
    </div>
    <p :class="['documento__nota', completo ? 'ok' : 'pendente']">
      <template v-if="completo">Documento completo.</template>
      <template v-else>Sem número e protocolo, o registro fica marcado como <strong>documento pendente</strong> até alguém completar.</template>
    </p>
  </fieldset>
</template>

<style scoped>
.documento {
  border: 1px dashed var(--borda-forte);
  border-radius: var(--raio);
  padding: 10px 12px 12px;
  margin: 0;
  min-width: 0;
}
.documento legend {
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--azul-escuro);
  padding: 0 6px;
}
.documento__grade {
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
.documento__nota {
  margin: 10px 0 0;
  font-size: 0.82rem;
}
.documento__aviso {
  margin: 0 0 10px;
  font-size: 0.82rem;
  color: var(--texto-2);
}
.documento__nota.pendente {
  color: #7a2e0e;
}
.documento__nota.ok {
  color: var(--s-em-dia);
}
.documento input[readonly] {
  background: #f1f3f6;
  color: var(--texto-2);
}
</style>
