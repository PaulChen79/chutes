<template><span>{{ filled }}</span></template>
<script>
export default {
  props: { rating: Number },
  data() {
    return {};
  },
  computed: {
    filled() {
      return "*".repeat(this.rating);
    },
  },
};
</script>
