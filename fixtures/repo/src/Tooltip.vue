<template><div ref="anchor"><slot /></div></template>
<script>
export default {
  mounted() {
    // Reaches into the parent's DOM to position itself.
    this.$refs.anchor.parentElement.style.position = "relative";
  },
  methods: {
    reposition() {
      this.$forceUpdate();
    },
  },
};
</script>
