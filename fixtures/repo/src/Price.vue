<template><span>{{ formatted }}</span></template>
<script>
export default {
  props: { cents: Number },
  data() {
    return {};
  },
  computed: {
    formatted() {
      return (this.cents / 100).toFixed(2);
    },
  },
};
</script>
