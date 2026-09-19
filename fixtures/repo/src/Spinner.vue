<template><div class="spinner" v-if="busy" /></template>
<script>
export default {
  props: { busy: Boolean },
  data() {
    return {};
  },
};
</script>
