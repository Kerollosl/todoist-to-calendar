// Service worker: all network calls (Todoist + Google Calendar) live here.
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});
