<template><label><slot /><input :value="value" @input="emit"></label></template>
<script>
import validation from "../mixins/validation.js";
export default {
  mixins: [validation],
  props: { value: String },
  methods: {
    emit(e) {
      this.$emit("input", e.target.value);
    },
  },
};
</script>
