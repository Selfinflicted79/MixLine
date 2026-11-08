// Per-app audio tap (WASAPI process loopback), same idea as OBS Application Audio Capture.
// --list                         JSON array of apps that have an audio session
// --capture <pid>                raw s16le stereo 48000 Hz on stdout until the pipe closes
#define _WIN32_WINNT 0x0A00
#define WINVER 0x0A00
#define NTDDI_VERSION 0x0A00000A
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <audiopolicy.h>
#include <endpointvolume.h>
#include <functiondiscoverykeys_devpkey.h>
#include <tlhelp32.h>
#include <winver.h>
#include <ksmedia.h>
#include <dwmapi.h>

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <fcntl.h>
#include <io.h>
#include <map>
#include <string>
#include <vector>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "mmdevapi.lib")
#pragma comment(lib, "uuid.lib")
#pragma comment(lib, "version.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "user32.lib")

static void Fail(const char* message, HRESULT hr) {
  std::fprintf(stderr, "%s (0x%08lX)\n", message, static_cast<unsigned long>(hr));
  std::fflush(stderr);
  std::exit(1);
}

class CompletionHandler final : public IActivateAudioInterfaceCompletionHandler {
 public:
  CompletionHandler() : ref_(1), done_(CreateEventW(nullptr, TRUE, FALSE, nullptr)), hr_(E_FAIL), client_(nullptr) {}

  HRESULT Wait(DWORD ms, IAudioClient** out) {
    if (WaitForSingleObject(done_, ms) != WAIT_OBJECT_0) return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
    if (FAILED(hr_)) return hr_;
    *out = client_;
    client_ = nullptr;
    return S_OK;
  }

  STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&ref_); }
  STDMETHODIMP_(ULONG) Release() override {
    ULONG n = InterlockedDecrement(&ref_);
    if (n == 0) delete this;
    return n;
  }
  STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IActivateAudioInterfaceCompletionHandler) ||
        riid == IID_IAgileObject) {
      *ppv = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    HRESULT activateHr = E_FAIL;
    IUnknown* unk = nullptr;
    HRESULT getHr = operation->GetActivateResult(&activateHr, &unk);
    if (FAILED(getHr)) hr_ = getHr;
    else if (FAILED(activateHr)) hr_ = activateHr;
    else if (!unk) hr_ = E_FAIL;
    else {
      hr_ = unk->QueryInterface(__uuidof(IAudioClient), reinterpret_cast<void**>(&client_));
      unk->Release();
    }
    SetEvent(done_);
    return S_OK;
  }

 private:
  ~CompletionHandler() {
    if (client_) client_->Release();
    if (done_) CloseHandle(done_);
  }
  LONG ref_;
  HANDLE done_;
  HRESULT hr_;
  IAudioClient* client_;
};

static HRESULT ActivateProcess(DWORD pid, IAudioClient** out) {
  *out = nullptr;
  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT pv;
  PropVariantInit(&pv);
  pv.vt = VT_BLOB;
  pv.blob.cbSize = sizeof(params);
  pv.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  CompletionHandler* handler = new CompletionHandler();
  IActivateAudioInterfaceAsyncOperation* op = nullptr;
  HRESULT hr = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &pv, handler, &op);
  if (FAILED(hr)) {
    handler->Release();
    return hr;
  }
  hr = handler->Wait(8000, out);
  handler->Release();
  if (op) op->Release();
  return hr;
}

struct CaptureFormat {
  bool directS16 = false;
  bool isFloat = false;
  int channels = 2;
  int bits = 16;
  int rate = 48000;
  int blockAlign = 4;
};

static bool IsFloatFormat(const WAVEFORMATEX* wfx) {
  if (wfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) return true;
  if (wfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
    const auto* ext = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(wfx);
    return IsEqualGUID(ext->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT) != FALSE;
  }
  return false;
}

static HRESULT OpenCapture(DWORD pid, IAudioClient** client, IAudioCaptureClient** capture, CaptureFormat* fmt) {
  *client = nullptr;
  *capture = nullptr;
  *fmt = {};

  WAVEFORMATEX desired = {};
  desired.wFormatTag = WAVE_FORMAT_PCM;
  desired.nChannels = 2;
  desired.nSamplesPerSec = 48000;
  desired.wBitsPerSample = 16;
  desired.nBlockAlign = 4;
  desired.nAvgBytesPerSec = 48000 * 4;

  const DWORD kDirectFlags = AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                             AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;

  IAudioClient* audio = nullptr;
  HRESULT hr = ActivateProcess(pid, &audio);
  if (FAILED(hr)) return hr;

  hr = audio->Initialize(AUDCLNT_SHAREMODE_SHARED, kDirectFlags, 1000000, 0, &desired, nullptr);
  if (SUCCEEDED(hr)) {
    fmt->directS16 = true;
    fmt->channels = 2;
    fmt->bits = 16;
    fmt->rate = 48000;
    fmt->blockAlign = 4;
  } else {
    audio->Release();
    audio = nullptr;
    hr = ActivateProcess(pid, &audio);
    if (FAILED(hr)) return hr;
    WAVEFORMATEX* mix = nullptr;
    hr = audio->GetMixFormat(&mix);
    if (FAILED(hr)) {
      audio->Release();
      return hr;
    }
    hr = audio->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK, 1000000, 0, mix, nullptr);
    if (FAILED(hr)) {
      audio->Release();
      audio = nullptr;
      HRESULT hr2 = ActivateProcess(pid, &audio);
      if (FAILED(hr2)) {
        CoTaskMemFree(mix);
        return hr;
      }
      hr = audio->Initialize(AUDCLNT_SHAREMODE_SHARED, 0, 1000000, 0, mix, nullptr);
    }
    if (SUCCEEDED(hr)) {
      fmt->directS16 = false;
      fmt->isFloat = IsFloatFormat(mix);
      fmt->channels = mix->nChannels;
      fmt->bits = mix->wBitsPerSample;
      fmt->rate = static_cast<int>(mix->nSamplesPerSec);
      fmt->blockAlign = mix->nBlockAlign;
    }
    CoTaskMemFree(mix);
    if (FAILED(hr)) {
      audio->Release();
      return hr;
    }
  }

  hr = audio->GetService(__uuidof(IAudioCaptureClient), reinterpret_cast<void**>(capture));
  if (FAILED(hr)) {
    audio->Release();
    return hr;
  }
  hr = audio->Start();
  if (FAILED(hr)) {
    (*capture)->Release();
    *capture = nullptr;
    audio->Release();
    return hr;
  }
  *client = audio;
  return S_OK;
}

struct Resampler {
  std::vector<std::pair<float, float>> frames;
  double pos = 0;
  double step = 1;
};

static void EmitS16(const std::vector<int16_t>& samples) {
  if (samples.empty()) return;
  const size_t n = samples.size();
  if (std::fwrite(samples.data(), sizeof(int16_t), n, stdout) != n) std::exit(0);
}

static void ConsumeFrames(Resampler* rs, std::vector<int16_t>* out) {
  while (rs->pos + 1.0 < static_cast<double>(rs->frames.size())) {
    const size_t i = static_cast<size_t>(rs->pos);
    const double frac = rs->pos - static_cast<double>(i);
    const float l = static_cast<float>(rs->frames[i].first * (1.0 - frac) + rs->frames[i + 1].first * frac);
    const float r = static_cast<float>(rs->frames[i].second * (1.0 - frac) + rs->frames[i + 1].second * frac);
    auto toS16 = [](float v) -> int16_t {
      if (v > 1.f) v = 1.f;
      if (v < -1.f) v = -1.f;
      return static_cast<int16_t>(v * 32767.f);
    };
    out->push_back(toS16(l));
    out->push_back(toS16(r));
    rs->pos += rs->step;
  }
  const size_t drop = static_cast<size_t>(rs->pos);
  if (drop > 0 && drop <= rs->frames.size()) {
    rs->frames.erase(rs->frames.begin(), rs->frames.begin() + static_cast<std::ptrdiff_t>(drop));
    rs->pos -= static_cast<double>(drop);
  }
}

static int Capture(DWORD pid) {
  if (pid == 0) Fail("Missing process id", E_INVALIDARG);
  _setmode(_fileno(stdout), _O_BINARY);
  std::setvbuf(stdout, nullptr, _IONBF, 0);

  HRESULT co = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(co) && co != RPC_E_CHANGED_MODE) Fail("COM init failed", co);

  IAudioClient* client = nullptr;
  IAudioCaptureClient* capture = nullptr;
  CaptureFormat fmt;
  HRESULT hr = OpenCapture(pid, &client, &capture, &fmt);
  if (FAILED(hr)) Fail("Could not tap that app. It may have closed.", hr);

  std::fprintf(stderr, "ready\n");
  std::fflush(stderr);

  Resampler rs;
  rs.step = fmt.rate > 0 ? static_cast<double>(fmt.rate) / 48000.0 : 1.0;
  std::vector<int16_t> out;
  out.reserve(48000);

  for (;;) {
    UINT32 packet = 0;
    hr = capture->GetNextPacketSize(&packet);
    if (FAILED(hr)) break;
    while (packet > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      hr = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;
      const bool silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0 || data == nullptr;
      if (fmt.directS16) {
        if (silent) {
          std::vector<int16_t> zeros(static_cast<size_t>(frames) * 2, 0);
          EmitS16(zeros);
        } else {
          const size_t n = static_cast<size_t>(frames) * 2;
          if (std::fwrite(data, sizeof(int16_t), n, stdout) != n) {
            capture->ReleaseBuffer(frames);
            std::exit(0);
          }
        }
      } else {
        rs.frames.reserve(rs.frames.size() + frames);
        for (UINT32 i = 0; i < frames; i++) {
          float l = 0.f;
          float r = 0.f;
          if (!silent) {
            if (fmt.isFloat && fmt.bits == 32) {
              const float* s = reinterpret_cast<const float*>(data + static_cast<size_t>(i) * fmt.blockAlign);
              l = s[0];
              r = fmt.channels > 1 ? s[1] : l;
            } else if (fmt.bits == 16) {
              const int16_t* s = reinterpret_cast<const int16_t*>(data + static_cast<size_t>(i) * fmt.blockAlign);
              l = s[0] / 32768.f;
              r = fmt.channels > 1 ? s[1] / 32768.f : l;
            }
          }
          rs.frames.push_back({l, r});
        }
        out.clear();
        ConsumeFrames(&rs, &out);
        EmitS16(out);
      }
      capture->ReleaseBuffer(frames);
      hr = capture->GetNextPacketSize(&packet);
      if (FAILED(hr)) break;
    }
    if (FAILED(hr)) break;
    Sleep(5);
  }

  client->Stop();
  capture->Release();
  client->Release();
  CoUninitialize();
  return 0;
}

static std::wstring BaseName(const std::wstring& path) {
  const auto pos = path.find_last_of(L"\\/");
  return pos == std::wstring::npos ? path : path.substr(pos + 1);
}

static std::wstring ProcessPath(DWORD pid) {
  HANDLE proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!proc) return L"";
  wchar_t buf[1024];
  DWORD size = 1024;
  std::wstring path;
  if (QueryFullProcessImageNameW(proc, 0, buf, &size)) path.assign(buf, size);
  CloseHandle(proc);
  return path;
}

static std::wstring FileDescription(const std::wstring& path) {
  DWORD dummy = 0;
  DWORD bytes = GetFileVersionInfoSizeW(path.c_str(), &dummy);
  if (!bytes) return L"";
  std::vector<BYTE> data(bytes);
  if (!GetFileVersionInfoW(path.c_str(), 0, bytes, data.data())) return L"";
  struct Lang {
    WORD lang;
    WORD cp;
  };
  Lang* lang = nullptr;
  UINT langLen = 0;
  if (!VerQueryValueW(data.data(), L"\\VarFileInfo\\Translation", reinterpret_cast<void**>(&lang), &langLen) ||
      !lang || langLen < sizeof(Lang)) {
    return L"";
  }
  wchar_t sub[96];
  std::swprintf(sub, 96, L"\\StringFileInfo\\%04x%04x\\FileDescription", lang->lang, lang->cp);
  wchar_t* desc = nullptr;
  UINT descLen = 0;
  if (!VerQueryValueW(data.data(), sub, reinterpret_cast<void**>(&desc), &descLen) || !desc || !desc[0]) return L"";
  return desc;
}

static std::string Utf8(const std::wstring& text) {
  if (text.empty()) return "";
  int n = WideCharToMultiByte(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
  if (n <= 0) return "";
  std::string out(static_cast<size_t>(n), '\0');
  WideCharToMultiByte(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), out.data(), n, nullptr, nullptr);
  return out;
}

static std::string JsonEscape(const std::string& text) {
  std::string out;
  out.reserve(text.size() + 8);
  for (unsigned char c : text) {
    switch (c) {
      case '\\':
        out += "\\\\";
        break;
      case '"':
        out += "\\\"";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      default:
        if (c < 0x20) break;
        out += static_cast<char>(c);
    }
  }
  return out;
}

static bool SkipExe(const std::wstring& exe) {
  const wchar_t* skip[] = {
      L"mixline.exe",
      L"mixline-capture.exe",
      L"audiodg.exe",
      L"svchost.exe",
      L"runtimebroker.exe",
      L"explorer.exe",
      L"shellexperiencehost.exe",
      L"startmenuexperiencehost.exe",
      L"searchhost.exe",
      L"textinputhost.exe",
      L"lockapp.exe",
      L"applicationframehost.exe",
      L"systemsettings.exe",
  };
  for (const wchar_t* name : skip) {
    if (_wcsicmp(exe.c_str(), name) == 0) return true;
  }
  return false;
}

struct ProcInfo {
  DWORD pid = 0;
  DWORD parent = 0;
  std::wstring exe;
};

static std::map<DWORD, ProcInfo> SnapshotProcesses() {
  std::map<DWORD, ProcInfo> map;
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return map;
  PROCESSENTRY32W pe;
  pe.dwSize = sizeof(pe);
  if (Process32FirstW(snap, &pe)) {
    do {
      ProcInfo info;
      info.pid = pe.th32ProcessID;
      info.parent = pe.th32ParentProcessID;
      info.exe = pe.szExeFile;
      map[info.pid] = info;
    } while (Process32NextW(snap, &pe));
  }
  CloseHandle(snap);
  return map;
}

static DWORD RootPid(const std::map<DWORD, ProcInfo>& procs, DWORD pid);

struct WindowGather {
  const std::map<DWORD, ProcInfo>* procs;
  std::map<DWORD, std::vector<std::wstring>> titles;
};

static BOOL CALLBACK CollectWindowProc(HWND hwnd, LPARAM lp) {
  auto* gather = reinterpret_cast<WindowGather*>(lp);
  if (!IsWindowVisible(hwnd)) return TRUE;
  const LONG ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
  if (ex & WS_EX_TOOLWINDOW) return TRUE;
  const HWND owner = GetWindow(hwnd, GW_OWNER);
  if (owner && !(ex & WS_EX_APPWINDOW)) return TRUE;
  BOOL cloaked = FALSE;
  if (SUCCEEDED(DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof(cloaked))) && cloaked) return TRUE;
  wchar_t title[256];
  if (GetWindowTextW(hwnd, title, 256) <= 0 || title[0] == 0) return TRUE;
  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  if (pid == 0) return TRUE;
  const DWORD root = RootPid(*gather->procs, pid);
  auto& list = gather->titles[root];
  const std::wstring text = title;
  for (const auto& existing : list) {
    if (_wcsicmp(existing.c_str(), text.c_str()) == 0) return TRUE;
  }
  if (list.size() < 6) list.push_back(text);
  return TRUE;
}

static DWORD RootPid(const std::map<DWORD, ProcInfo>& procs, DWORD pid) {
  DWORD cur = pid;
  std::wstring exe;
  auto it = procs.find(cur);
  if (it != procs.end()) exe = it->second.exe;
  for (int i = 0; i < 16; i++) {
    auto curIt = procs.find(cur);
    if (curIt == procs.end()) break;
    DWORD parent = curIt->second.parent;
    if (parent == 0 || parent == cur) break;
    auto parentIt = procs.find(parent);
    if (parentIt == procs.end()) break;
    if (!exe.empty() && _wcsicmp(parentIt->second.exe.c_str(), exe.c_str()) != 0) break;
    cur = parent;
    exe = parentIt->second.exe;
  }
  return cur;
}

struct AppRow {
  DWORD pid = 0;
  std::wstring name;
  std::wstring exe;
  std::wstring hint;
  bool active = false;
};

static int List() {
  HRESULT co = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(co) && co != RPC_E_CHANGED_MODE) Fail("COM init failed", co);

  IMMDeviceEnumerator* enumerator = nullptr;
  HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                                reinterpret_cast<void**>(&enumerator));
  if (FAILED(hr)) Fail("Could not list audio devices", hr);

  IMMDeviceCollection* devices = nullptr;
  hr = enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devices);
  enumerator->Release();
  if (FAILED(hr)) Fail("Could not list playback devices", hr);

  const auto procs = SnapshotProcesses();
  std::map<std::wstring, std::wstring> descriptions;
  std::map<DWORD, AppRow> rows;

  WindowGather windows;
  windows.procs = &procs;
  EnumWindows(CollectWindowProc, reinterpret_cast<LPARAM>(&windows));
  for (const auto& kv : windows.titles) {
    const DWORD root = kv.first;
    std::wstring path = ProcessPath(root);
    std::wstring exe = BaseName(path);
    if (exe.empty()) {
      auto it = procs.find(root);
      if (it != procs.end()) exe = it->second.exe;
    }
    if (exe.empty() || SkipExe(exe)) continue;
    std::wstring product;
    if (!path.empty()) {
      product = FileDescription(path);
      descriptions[path] = product;
    }
    if (product.empty()) product = exe;
    AppRow row;
    row.pid = root;
    row.exe = exe;
    if (kv.second.size() == 1 && kv.second[0].size() <= 42) {
      row.name = kv.second[0];
      if (_wcsicmp(row.name.c_str(), product.c_str()) != 0) row.hint = product;
    } else {
      row.name = product;
      for (const auto& title : kv.second) {
        if (_wcsicmp(title.c_str(), row.name.c_str()) == 0) continue;
        if (row.hint.empty()) row.hint = title;
        else if (row.hint.size() < 100) row.hint += L" · " + title;
      }
    }
    rows[root] = row;
  }
  UINT deviceCount = 0;
  devices->GetCount(&deviceCount);
  for (UINT di = 0; di < deviceCount; di++) {
    IMMDevice* device = nullptr;
    if (FAILED(devices->Item(di, &device)) || !device) continue;
    IAudioSessionManager2* manager = nullptr;
    hr = device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&manager));
    device->Release();
    if (FAILED(hr) || !manager) continue;

    IAudioSessionEnumerator* sessions = nullptr;
    hr = manager->GetSessionEnumerator(&sessions);
    manager->Release();
    if (FAILED(hr) || !sessions) continue;

    int count = 0;
    sessions->GetCount(&count);
    for (int i = 0; i < count; i++) {
      IAudioSessionControl* control = nullptr;
      if (FAILED(sessions->GetSession(i, &control)) || !control) continue;
      IAudioSessionControl2* control2 = nullptr;
      if (FAILED(control->QueryInterface(__uuidof(IAudioSessionControl2), reinterpret_cast<void**>(&control2)))) {
        control->Release();
        continue;
      }
      if (control2->IsSystemSoundsSession() == S_OK) {
        control2->Release();
        control->Release();
        continue;
      }
      DWORD pid = 0;
      control2->GetProcessId(&pid);
      AudioSessionState state = AudioSessionStateExpired;
      control->GetState(&state);
      LPWSTR display = nullptr;
      control->GetDisplayName(&display);
      std::wstring displayName = display ? display : L"";
      if (display) CoTaskMemFree(display);
      control2->Release();
      control->Release();

      if (pid == 0 || state == AudioSessionStateExpired) continue;
      DWORD root = RootPid(procs, pid);
      std::wstring path = ProcessPath(root);
      std::wstring exe = BaseName(path);
      if (exe.empty()) {
        auto it = procs.find(root);
        if (it != procs.end()) exe = it->second.exe;
      }
      if (exe.empty() || SkipExe(exe)) continue;

      std::wstring product;
      auto descIt = descriptions.find(path);
      if (descIt != descriptions.end()) product = descIt->second;
      else if (!path.empty()) {
        product = FileDescription(path);
        descriptions[path] = product;
      }
      if (product.empty()) product = exe;

      auto& row = rows[root];
      row.pid = root;
      row.exe = exe;
      if (row.name.empty()) row.name = product;
      if (state == AudioSessionStateActive) row.active = true;
      if (!displayName.empty() && _wcsicmp(displayName.c_str(), product.c_str()) != 0 &&
          _wcsicmp(displayName.c_str(), exe.c_str()) != 0) {
        if (row.hint.empty()) row.hint = displayName;
        else if (row.hint.find(displayName) == std::wstring::npos) {
          if (row.hint.size() < 80) row.hint += L", " + displayName;
        }
        if (displayName.size() > 1 && displayName.size() < 64 &&
            (_wcsicmp(product.c_str(), L"Google Chrome") == 0 || _wcsicmp(product.c_str(), L"Microsoft Edge") == 0 ||
             _wcsicmp(product.c_str(), exe.c_str()) == 0)) {
          row.name = displayName;
        }
      }
    }
    sessions->Release();
  }
  devices->Release();

  std::vector<AppRow> ordered;
  ordered.reserve(rows.size());
  for (auto& kv : rows) ordered.push_back(kv.second);
  std::sort(ordered.begin(), ordered.end(), [](const AppRow& a, const AppRow& b) {
    if (a.active != b.active) return a.active && !b.active;
    return _wcsicmp(a.name.c_str(), b.name.c_str()) < 0;
  });

  std::printf("[");
  for (size_t i = 0; i < ordered.size(); i++) {
    const auto& row = ordered[i];
    if (i) std::printf(",");
    std::printf(
        "{\"pid\":%lu,\"name\":\"%s\",\"exe\":\"%s\",\"hint\":\"%s\",\"state\":\"%s\"}",
        static_cast<unsigned long>(row.pid),
        JsonEscape(Utf8(row.name)).c_str(),
        JsonEscape(Utf8(row.exe)).c_str(),
        JsonEscape(Utf8(row.hint)).c_str(),
        row.active ? "active" : "inactive");
  }
  std::printf("]\n");
  std::fflush(stdout);
  CoUninitialize();
  return 0;
}

static std::wstring NormalizeDeviceNeedle(const wchar_t* raw) {
  if (!raw) return L"";
  std::wstring s(raw);
  auto strip = [&](const wchar_t* prefix) {
    size_t n = wcslen(prefix);
    if (s.size() >= n && _wcsnicmp(s.c_str(), prefix, n) == 0) s = s.substr(n);
  };
  strip(L"Default - ");
  strip(L"Default – ");
  strip(L"Communications - ");
  strip(L"Communications – ");
  while (!s.empty() && (s.front() == L' ' || s.front() == L'\t')) s.erase(s.begin());
  return s;
}

static HRESULT FindRenderDevice(IMMDeviceEnumerator* en, const wchar_t* needle, IMMDevice** out) {
  *out = nullptr;
  std::wstring want = NormalizeDeviceNeedle(needle);
  if (want.empty()) {
    return en->GetDefaultAudioEndpoint(eRender, eConsole, out);
  }

  IMMDeviceCollection* devices = nullptr;
  HRESULT hr = en->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devices);
  if (FAILED(hr)) return hr;
  UINT count = 0;
  devices->GetCount(&count);
  IMMDevice* fallback = nullptr;
  for (UINT i = 0; i < count; i++) {
    IMMDevice* device = nullptr;
    if (FAILED(devices->Item(i, &device)) || !device) continue;
    IPropertyStore* props = nullptr;
    if (FAILED(device->OpenPropertyStore(STGM_READ, &props)) || !props) {
      device->Release();
      continue;
    }
    PROPVARIANT name;
    PropVariantInit(&name);
    std::wstring friendly;
    if (SUCCEEDED(props->GetValue(PKEY_Device_FriendlyName, &name)) && name.vt == VT_LPWSTR && name.pwszVal) {
      friendly = name.pwszVal;
    }
    PropVariantClear(&name);
    props->Release();

    if (!friendly.empty() && friendly.find(want) != std::wstring::npos) {
      *out = device;
      if (fallback) fallback->Release();
      devices->Release();
      return S_OK;
    }
    if (!fallback) fallback = device;
    else device->Release();
  }
  devices->Release();
  if (fallback) {
    *out = fallback;
    return S_OK;
  }
  return en->GetDefaultAudioEndpoint(eRender, eConsole, out);
}

static int VolumeGet(const wchar_t* needle) {
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  const bool com = SUCCEEDED(hr) || hr == S_FALSE;
  IMMDeviceEnumerator* en = nullptr;
  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                        reinterpret_cast<void**>(&en));
  if (FAILED(hr)) {
    if (com) CoUninitialize();
    Fail("Could not create device enumerator", hr);
  }
  IMMDevice* device = nullptr;
  hr = FindRenderDevice(en, needle, &device);
  en->Release();
  if (FAILED(hr) || !device) {
    if (com) CoUninitialize();
    Fail("Could not find output device", hr);
  }
  IAudioEndpointVolume* vol = nullptr;
  hr = device->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&vol));
  device->Release();
  if (FAILED(hr) || !vol) {
    if (com) CoUninitialize();
    Fail("Could not open endpoint volume", hr);
  }
  float level = 0.f;
  BOOL muted = FALSE;
  vol->GetMasterVolumeLevelScalar(&level);
  vol->GetMute(&muted);
  vol->Release();
  std::printf("{\"volume\":%.4f,\"muted\":%s}\n", level, muted ? "true" : "false");
  std::fflush(stdout);
  if (com) CoUninitialize();
  return 0;
}

static int VolumeSet(float level, const wchar_t* needle) {
  if (level < 0.f) level = 0.f;
  if (level > 1.f) level = 1.f;
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  const bool com = SUCCEEDED(hr) || hr == S_FALSE;
  IMMDeviceEnumerator* en = nullptr;
  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                        reinterpret_cast<void**>(&en));
  if (FAILED(hr)) {
    if (com) CoUninitialize();
    Fail("Could not create device enumerator", hr);
  }
  IMMDevice* device = nullptr;
  hr = FindRenderDevice(en, needle, &device);
  en->Release();
  if (FAILED(hr) || !device) {
    if (com) CoUninitialize();
    Fail("Could not find output device", hr);
  }
  IAudioEndpointVolume* vol = nullptr;
  hr = device->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&vol));
  device->Release();
  if (FAILED(hr) || !vol) {
    if (com) CoUninitialize();
    Fail("Could not open endpoint volume", hr);
  }
  hr = vol->SetMasterVolumeLevelScalar(level, nullptr);
  vol->Release();
  if (FAILED(hr)) {
    if (com) CoUninitialize();
    Fail("Could not set volume", hr);
  }
  std::printf("{\"ok\":true,\"volume\":%.4f}\n", level);
  std::fflush(stdout);
  if (com) CoUninitialize();
  return 0;
}

static int VolumeMute(bool muted, const wchar_t* needle) {
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  const bool com = SUCCEEDED(hr) || hr == S_FALSE;
  IMMDeviceEnumerator* en = nullptr;
  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                        reinterpret_cast<void**>(&en));
  if (FAILED(hr)) {
    if (com) CoUninitialize();
    Fail("Could not create device enumerator", hr);
  }
  IMMDevice* device = nullptr;
  hr = FindRenderDevice(en, needle, &device);
  en->Release();
  if (FAILED(hr) || !device) {
    if (com) CoUninitialize();
    Fail("Could not find output device", hr);
  }
  IAudioEndpointVolume* vol = nullptr;
  hr = device->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&vol));
  device->Release();
  if (FAILED(hr) || !vol) {
    if (com) CoUninitialize();
    Fail("Could not open endpoint volume", hr);
  }
  hr = vol->SetMute(muted ? TRUE : FALSE, nullptr);
  vol->Release();
  if (FAILED(hr)) {
    if (com) CoUninitialize();
    Fail("Could not set mute", hr);
  }
  std::printf("{\"ok\":true,\"muted\":%s}\n", muted ? "true" : "false");
  std::fflush(stdout);
  if (com) CoUninitialize();
  return 0;
}

static int VolumePeak(const wchar_t* needle) {
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  const bool com = SUCCEEDED(hr) || hr == S_FALSE;
  IMMDeviceEnumerator* en = nullptr;
  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                        reinterpret_cast<void**>(&en));
  if (FAILED(hr)) {
    if (com) CoUninitialize();
    Fail("Could not create device enumerator", hr);
  }
  IMMDevice* device = nullptr;
  hr = FindRenderDevice(en, needle, &device);
  en->Release();
  if (FAILED(hr) || !device) {
    if (com) CoUninitialize();
    Fail("Could not find output device", hr);
  }
  IAudioMeterInformation* meter = nullptr;
  hr = device->Activate(__uuidof(IAudioMeterInformation), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&meter));
  device->Release();
  if (FAILED(hr) || !meter) {
    if (com) CoUninitialize();
    Fail("Could not open endpoint meter", hr);
  }
  float peak = 0.f;
  meter->GetPeakValue(&peak);
  meter->Release();
  std::printf("{\"peak\":%.4f}\n", peak);
  std::fflush(stdout);
  if (com) CoUninitialize();
  return 0;
}

int wmain(int argc, wchar_t** argv) {
  if (argc >= 2 && wcscmp(argv[1], L"--list") == 0) return List();
  if (argc >= 3 && wcscmp(argv[1], L"--capture") == 0) return Capture(static_cast<DWORD>(_wtoi(argv[2])));
  if (argc >= 2 && wcscmp(argv[1], L"--volume-get") == 0) {
    return VolumeGet(argc >= 3 ? argv[2] : L"");
  }
  if (argc >= 3 && wcscmp(argv[1], L"--volume-set") == 0) {
    return VolumeSet(static_cast<float>(_wtof(argv[2])), argc >= 4 ? argv[3] : L"");
  }
  if (argc >= 3 && wcscmp(argv[1], L"--volume-mute") == 0) {
    return VolumeMute(_wtoi(argv[2]) != 0, argc >= 4 ? argv[3] : L"");
  }
  if (argc >= 2 && wcscmp(argv[1], L"--volume-peak") == 0) {
    return VolumePeak(argc >= 3 ? argv[2] : L"");
  }
  std::fprintf(
      stderr,
      "usage: mixline-capture --list | --capture <pid> | --volume-get [name] | --volume-set <0-1> [name] | --volume-mute <0|1> [name] | --volume-peak [name]\n");
  return 2;
}
