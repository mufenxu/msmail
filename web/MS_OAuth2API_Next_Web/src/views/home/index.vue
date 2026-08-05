<template>
  <div class="home-container">
    <div class="content-box">
      <h1>Monkey Mail</h1>
      <p class="lead">Microsoft Outlook 多邮箱只读收件中心</p>
      <p>在浏览器本地管理邮箱配置，按需读取收件箱和垃圾箱邮件。邮件操作不会写回或删除 Microsoft 邮箱内容。</p>

      <h3>当前能力</h3>
      <ul>
        <li>支持文件上传和粘贴导入多个邮箱</li>
        <li>自动尝试 Microsoft Graph 和 Outlook IMAP OAuth2</li>
        <li>读取收件箱和垃圾箱邮件</li>
        <li>刷新令牌不在邮箱列表中显示，也不会提供导出功能</li>
      </ul>

      <h3>开始使用</h3>
      <p>进入“邮箱管理”后填写服务访问密码，再导入邮箱配置即可收件。</p>
    </div>
  </div>
</template>

<script lang="ts" setup>

</script>

<style scoped>
.content-box {
  background: #fff;
  border-radius: 8px;
}

h3 {
  color: #2c3e50;
  font-size: 1.5rem;
  margin-top: 2rem;
  margin-bottom: 1rem;
  font-weight: 600;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

h1 {
  color: #1f2937;
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.lead {
  color: #2563eb;
  font-size: 1.1rem;
}

p {
  margin-bottom: 1rem;
  color: #555;
}

a {
  color: #3498db;
  text-decoration: none;
  transition: color 0.2s ease;
}

a:hover {
  color: #2980b9;
  text-decoration: underline;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

li {
  padding: 0.5rem 0;
  padding-left: 1.5rem;
  position: relative;
  color: #555;
}

li:before {
  content: '•';
  color: #3498db;
  font-weight: bold;
  position: absolute;
  left: 0;
}

/* 第一个h3不需要顶部margin */
h3:first-of-type {
  margin-top: 0;
}

@media (max-width: 768px) {
  .home-container {
    padding: 1rem;
  }
  
  .content-box {
    padding: 1.5rem;
  }
  
  h3 {
    font-size: 1.3rem;
  }
}
</style>
