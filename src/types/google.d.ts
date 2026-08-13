/**
 * index.html에서 <script src="https://accounts.google.com/gsi/client">로 로드되는
 * Google Identity Services(GIS) 전역 타입. OAuth 액세스 토큰 발급(Drive API용)에 사용한다.
 */
interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
}

interface GoogleTokenClient {
  requestAccessToken(overrideConfig?: { prompt?: '' | 'none' | 'consent' | 'select_account' }): void;
}

interface GoogleAccountsOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
  }): GoogleTokenClient;
  revoke(accessToken: string, done?: () => void): void;
}

interface Window {
  google?: {
    accounts: {
      oauth2: GoogleAccountsOauth2;
    };
    picker?: GooglePickerNamespace;
  };
  gapi?: {
    load: (api: string, options: { callback: () => void; onerror?: () => void }) => void;
  };
}

/**
 * https://apis.google.com/js/api.js 로 로드하는 Google Picker API(gapi.load('picker', ...)) 타입.
 * drive.file 스코프에서, 앱이 만들지 않은 기존 파일에 접근하려면 사용자가 피커로 직접 열어줘야 한다.
 */
interface GooglePickerNamespace {
  PickerBuilder: new () => GooglePickerBuilder;
  DocsView: new (viewId?: string) => GoogleDocsView;
  ViewId: { DOCS: string };
  Action: { PICKED: string; CANCEL: string };
  Feature: { MULTISELECT_ENABLED: string };
}

interface GoogleDocsView {
  setMimeTypes(mimeTypes: string): GoogleDocsView;
  setSelectFolderEnabled(enabled: boolean): GoogleDocsView;
}

interface GooglePickerBuilder {
  addView(view: GoogleDocsView): GooglePickerBuilder;
  setOAuthToken(token: string): GooglePickerBuilder;
  setDeveloperKey(key: string): GooglePickerBuilder;
  setAppId(appId: string): GooglePickerBuilder;
  enableFeature(feature: string): GooglePickerBuilder;
  setCallback(cb: (data: GooglePickerCallbackData) => void): GooglePickerBuilder;
  build(): GooglePickerInstance;
}

interface GooglePickerInstance {
  setVisible(visible: boolean): void;
}

interface GooglePickerCallbackData {
  action: string;
  docs?: { id: string; name: string }[];
}
