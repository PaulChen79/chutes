<template><div v-if="open"><slot /></div></template>
<script>
export default {
  data() {
    return { open: false };
  },
  mounted() {
    document.body.appendChild(this.$el);
  },
  beforeDestroy() {
    document.body.removeChild(this.$el);
  },
};
</script>
