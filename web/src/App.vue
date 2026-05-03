<template>
  <el-container class="app-root">
    <el-header class="app-header">
      <div class="header-left">
        <span class="logo">📈 汇率预测机</span>
        <span class="subtitle">USDCNH · 策略辅助工作台</span>
      </div>
      <el-menu
        mode="horizontal"
        :router="true"
        :default-active="route.path"
        class="nav-menu"
      >
        <el-menu-item index="/dashboard">工作台</el-menu-item>
        <el-menu-item index="/history/predictions">预测历史</el-menu-item>
        <el-menu-item index="/history/tasks">任务日志</el-menu-item>
      </el-menu>
    </el-header>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router"
const route = useRoute()
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; background: #f4f6f9; }
.app-root { min-height: 100vh; }
.app-header {
  display: flex;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 24px;
  height: 56px !important;
  position: sticky;
  top: 0;
  z-index: 100;
}
.header-left { display: flex; align-items: center; gap: 12px; margin-right: 40px; }
.logo { font-size: 18px; font-weight: 700; color: #1a1a2e; }
.subtitle { font-size: 12px; color: #909399; }
.nav-menu { border-bottom: none !important; flex: 1; }
.app-main { padding: 20px; }
</style>
