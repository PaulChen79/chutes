<template><transition-group :name="name" tag="ul"><slot /></transition-group></template>
<script>
export default {
  props: { name: String },
  // Transition class names changed in Vue 3, and this component exposes
  // them to callers as part of its API.
  mounted() {
    this.$el.classList.add(`${this.name}-leave-active`);
  },
};
</script>
