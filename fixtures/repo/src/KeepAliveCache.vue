<template><keep-alive :include="include"><slot /></keep-alive></template>
<script>
export default {
  props: { include: Array },
  data() {
    return { cache: {} };
  },
  // Reaches into keep-alive's private cache, which Vue 3 restructured.
  activated() {
    this.cache = this.$children[0]._vnode.componentInstance.cache;
  },
};
</script>
