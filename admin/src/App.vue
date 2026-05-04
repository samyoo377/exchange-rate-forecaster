<template>
  <el-container class="app-container">
    <el-aside width="200px" class="sidebar">
      <div class="logo">管理后台</div>
      <el-menu
        :default-active="route.path"
        router
        background-color="#001529"
        text-color="#ffffffa6"
        active-text-color="#fff"
      >
        <el-menu-item index="/overview">
          <el-icon><Monitor /></el-icon>
          <span>系统概览</span>
        </el-menu-item>
        <el-menu-item index="/cron">
          <el-icon><Timer /></el-icon>
          <span>定时任务</span>
        </el-menu-item>
        <el-menu-item index="/database">
          <el-icon><Coin /></el-icon>
          <span>数据中心</span>
        </el-menu-item>
        <el-menu-item index="/news-sources">
          <el-icon><Reading /></el-icon>
          <span>新闻源管理</span>
        </el-menu-item>
        <el-menu-item index="/indicators">
          <el-icon><DataAnalysis /></el-icon>
          <span>指标配置</span>
        </el-menu-item>
        <el-menu-item index="/assistant">
          <el-icon><ChatLineSquare /></el-icon>
          <span>AI 助手</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main class="main-content">
      <router-view />
    </el-main>
    <AiFloatingWidget />
  </el-container>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router"
import AiFloatingWidget from "./components/AiFloatingWidget.vue"

const route = useRoute()
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

.app-container { height: 100vh; }

.sidebar {
  background: #001529;
  overflow-y: auto;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  border-bottom: 1px solid #ffffff1a;
}

.el-menu {
  border-right: none !important;
}

.main-content {
  background: #f0f2f5;
  overflow-y: auto;
  padding: 20px;
}
</style>
