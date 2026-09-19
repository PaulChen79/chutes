<template><hr :class="variant"></template>
<script>
export default {
  props: { variant: { type: String, default: "solid" } },
  data() {
    return {};
  },
};
</script>
