<template><div /></template>
<script>
export default {
  // $scopedSlots and $slots were unified in Vue 3; callers pass slots
  // differently, so this component's contract changes.
  render(h) {
    return h(
      "div",
      this.$scopedSlots.default ? this.$scopedSlots.default({}) : this.$slots.default,
    );
  },
};
</script>
