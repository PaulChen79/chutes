<template><span class="badge">{{ label }}</span></template>
<script>
export default {
  props: { label: String },
  data() {
    return { seen: false };
  },
};
</script>
