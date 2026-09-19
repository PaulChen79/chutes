<template><ul @scroll="onScroll"><li v-for="i in items" :key="i.id">{{ i.name }}</li></ul></template>
<script>
export default {
  props: { items: Array },
  data() {
    return { offset: 0 };
  },
  methods: {
    onScroll(e) {
      if (e.target.scrollTop > this.offset) this.$emit("more");
    },
  },
};
</script>
