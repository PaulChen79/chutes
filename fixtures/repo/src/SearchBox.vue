<template><input v-model="q" @input="debounced"></template>
<script>
import debounce from "lodash/debounce";
export default {
  data() {
    return { q: "" };
  },
  created() {
    this.debounced = debounce(this.search, 300);
  },
  methods: {
    search() {
      this.$emit("search", this.q);
    },
  },
};
</script>
