// Google Picker API 연동 — drive.file 스코프에서 앱이 만들지 않은 기존 파일에 접근하려면,
// 사용자가 피커를 통해 그 파일을 명시적으로 "열어줘야" 한다. 앱이 자체 검색으로는 절대
// 접근 못 하는 파일도, 사용자가 피커에서 직접 고르는 순간 접근 권한이 생긴다.
//
// Picker는 GIS(로그인용)와는 별개의 스크립트(gapi)와, OAuth 클라이언트 ID와도 별개인
// "API 키"(VITE_GOOGLE_API_KEY)가 필요하다. .env.example 참고.

import { getFreshAccessToken } from './driveClient';

const PICKER_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const PICKER_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined;

let pickerReady = false;

function loadGapiScript(): Promise<void> {
  if (window.gapi) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google API 스크립트를 불러오지 못했습니다.'));
    document.body.appendChild(script);
  });
}

function loadPickerLibrary(): Promise<void> {
  return new Promise((resolve, reject) => {
    window.gapi!.load('picker', {
      callback: () => resolve(),
      onerror: () => reject(new Error('Google Picker 라이브러리를 불러오지 못했습니다.')),
    });
  });
}

export interface PickedFile {
  id: string;
  name: string;
}

/** 구글 피커를 열어서 사용자가 드라이브의 CSV 파일을 직접 선택하게 한다 (여러 개 선택 가능). */
export async function openCsvFilePicker(): Promise<PickedFile[]> {
  // 피커를 열기 전에 토큰이 만료돼 있을 수도 있으니(오래 열어둔 세션), 필요하면 조용히 갱신한다.
  const accessToken = await getFreshAccessToken();
  if (!PICKER_API_KEY) {
    throw new Error(
      'VITE_GOOGLE_API_KEY가 설정되지 않았습니다. .env.example을 참고해 값을 채워주세요.'
    );
  }
  if (!PICKER_APP_ID) {
    throw new Error(
      'VITE_GOOGLE_APP_ID가 설정되지 않았습니다. .env.example을 참고해 값을 채워주세요. ' +
        '(drive.file 스코프에서는 setAppId가 필수라, 이게 없으면 파일을 골라도 실제로 접근 권한이 부여되지 않습니다.)'
    );
  }

  if (!pickerReady) {
    await loadGapiScript();
    await loadPickerLibrary();
    pickerReady = true;
  }

  const picker = window.google!.picker!;

  return new Promise((resolve, reject) => {
    try {
      const view = new picker.DocsView(picker.ViewId.DOCS)
        .setMimeTypes('text/csv')
        .setSelectFolderEnabled(false);

      const instance = new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(PICKER_API_KEY)
        .setAppId(PICKER_APP_ID)
        .enableFeature(picker.Feature.MULTISELECT_ENABLED)
        .setCallback((data) => {
          if (data.action === picker.Action.PICKED) {
            resolve((data.docs ?? []).map((doc) => ({ id: doc.id, name: doc.name })));
          } else if (data.action === picker.Action.CANCEL) {
            resolve([]);
          }
        })
        .build();

      instance.setVisible(true);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Google Picker를 여는 데 실패했습니다.'));
    }
  });
}
