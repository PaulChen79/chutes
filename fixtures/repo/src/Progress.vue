<template><progress :value="value" max="100" /></template>
<script>
export default {
  props: { value: Number },
  data() {
    return {};
  },
  computed: {
    done() {
      return this.value >= 100;
    },
  },
};
</script>
