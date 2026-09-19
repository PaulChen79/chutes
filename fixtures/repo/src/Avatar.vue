<template><img :src="src" :alt="name"></template>
<script>
export default {
  props: { src: String, name: String },
  data() {
    return { loaded: false };
  },
  computed: {
    initials() {
      return this.name.slice(0, 2);
    },
  },
};
</script>
