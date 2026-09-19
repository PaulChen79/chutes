<template><nav><span v-for="c in crumbs" :key="c.path">{{ c.label }}</span></nav></template>
<script>
export default {
  data() {
    return {};
  },
  computed: {
    // Reads the router off the root instance rather than being passed it.
    crumbs() {
      return this.$root.$route.matched.map((m) => m.meta);
    },
  },
};
</script>
