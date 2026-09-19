<template><div><slot /></div></template>
<script>
export default {
  // Relies on the Vue 2 guarantee that a parent's mounted() runs after
  // every child's. Vue 3 changes the order for async components.
  mounted() {
    this.measureChildren();
  },
  methods: {
    measureChildren() {
      this.$children.forEach((c) => c.measure());
    },
  },
};
</script>
