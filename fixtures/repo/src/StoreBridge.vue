<template><div><slot :state="state" /></div></template>
<script>
import Vue from "vue";
export default {
  data() {
    return { state: {} };
  },
  methods: {
    // Vue 2 reactivity escape hatch; there is no equivalent in Vue 3.
    put(key, value) {
      Vue.set(this.state, key, value);
    },
    drop(key) {
      Vue.delete(this.state, key);
    },
  },
};
</script>
