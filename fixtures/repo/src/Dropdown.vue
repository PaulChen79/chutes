<template><div @click.stop="toggle"><slot /></div></template>
<script>
export default {
  data() {
    return { open: false };
  },
  mounted() {
    document.addEventListener("click", this.close);
  },
  beforeDestroy() {
    document.removeEventListener("click", this.close);
  },
  methods: {
    toggle() {
      this.open = !this.open;
    },
    close() {
      this.open = false;
    },
  },
};
</script>
