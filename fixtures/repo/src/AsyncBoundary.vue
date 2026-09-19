<template><component :is="resolved" /></template>
<script>
export default {
  // The Vue 2 async component factory signature was replaced by
  // defineAsyncComponent, and the error/loading contract changed.
  data() {
    return { resolved: null };
  },
  created() {
    this.resolved = () => ({
      component: import("./LegacyGrid.vue"),
      loading: { render: (h) => h("div", "loading") },
      error: { render: (h) => h("div", "error") },
      delay: 200,
    });
  },
};
</script>
