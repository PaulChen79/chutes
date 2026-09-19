<template><canvas ref="canvas" /></template>
<script>
export default {
  props: { series: Array },
  watch: { series: { handler: "redraw", deep: true } },
  mounted() {
    this.redraw();
  },
  methods: {
    redraw() {
      /* imperative canvas drawing */
    },
  },
};
</script>
