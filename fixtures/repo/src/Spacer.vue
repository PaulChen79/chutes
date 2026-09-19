<template><div :style="{ height: size + 'px' }" /></template>
<script>
export default {
  props: { size: { type: Number, default: 8 } },
  data() {
    return {};
  },
};
</script>
