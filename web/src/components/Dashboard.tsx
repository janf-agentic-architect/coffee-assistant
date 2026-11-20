export async function Dashboard() {
  return (
    <div class="app-container">
      <section class="dashboard-panel">
        <div id="orders-dashboard-root"></div>
      </section>
      <section class="assistant-panel">
        <div class="assistant-header">
          <span class="assistant-header-title">☕ Asistente Virtual</span>
          <span class="assistant-header-status">● Online</span>
        </div>
        <div id="assistant-ui-root"></div>
      </section>
    </div>
  )
}
