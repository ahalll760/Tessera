import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, Image,
  FlatList, SafeAreaView, KeyboardAvoidingView, Platform, 
  StatusBar, Modal, Pressable, Animated, ScrollView, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROVIDERS = [
  {
    id: 'free_tier',
    name: '🌟 100% Free Models',
    models: [
      { id: 'openrouter/free', name: 'Auto-Router (Fast & Free)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta: Llama 3.3 70B' },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek: R1 (Reasoning)' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Alibaba: Qwen 2.5 Coder' },
      { id: 'google/gemma-2-9b-it:free', name: 'Google: Gemma 2 9B' }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI (Vision + Text)',
    models: [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Fast Vision)' },
      { id: 'openai/gpt-4o', name: 'GPT-4o (Best Vision)' },
      { id: 'openai/o3-mini', name: 'o3-mini (Reasoning)' }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Vision + Text)',
    models: [
      { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }
    ]
  },
  {
    id: 'google',
    name: 'Google Pro (Vision + Text)',
    models: [
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'google/gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
    ]
  }
];

const EXT_MAP = {
  javascript: 'js', js: 'js', jsx: 'jsx', ts: 'ts', typescript: 'ts',
  python: 'py', py: 'py', lua: 'lua', html: 'html', css: 'css',
  json: 'json', sql: 'sql', bash: 'sh', sh: 'sh', markdown: 'md', md: 'md', txt: 'txt'
};

const downloadFile = (filename, content) => {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => reject(new Error('Could not read image.'));
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

const processVideo = (file) => new Promise((resolve, reject) => {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  video.onloadedmetadata = async () => {
    if (video.duration > 70) {
      URL.revokeObjectURL(url);
      return reject(new Error(`Video is ${Math.ceil(video.duration)}s. Maximum allowed is 70 seconds.`));
    }
    const stamps = [0.15, 0.4, 0.65, 0.88].map(p => Math.min(Math.max(0.1, video.duration - 0.1), video.duration * p));
    const frames = [];
    const canvas = document.createElement('canvas');

    for (const time of stamps) {
      await new Promise((res) => {
        const timer = setTimeout(res, 1500);
        video.onseeked = () => {
          clearTimeout(timer);
          const scale = Math.min(1, 640 / Math.max(video.videoWidth || 640, video.videoHeight || 480));
          canvas.width = (video.videoWidth || 640) * scale;
          canvas.height = (video.videoHeight || 480) * scale;
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.6));
          res();
        };
        video.currentTime = time;
      });
    }
    URL.revokeObjectURL(url);
    resolve({ frames, duration: Math.round(video.duration) });
  };
  video.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Unsupported video format. Try MP4.'));
  };
  video.src = url;
  video.load();
});

const ThinkingIndicator = () => {
  const fadeAnim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 600, useNativeDriver: true })
      ])
    ).start();
  }, []);
  return (
    <View style={styles.aiMsg}>
      <Animated.Text style={[styles.msgText, { opacity: fadeAnim, color: '#888', fontStyle: 'italic' }]}>
        ✧ Synthesizing...
      </Animated.Text>
    </View>
  );
};

const CodeBlock = ({ code, filename, language }) => {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSave = () => {
    downloadFile(filename, code);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <View style={styles.codeContainer}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLang} numberOfLines={1}>📄 {filename || language}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={handleSave} style={styles.copyBtn}>
            <Text style={styles.saveBtnText}>{saved ? 'Saved ✓' : 'Save 💾'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleCopy} style={styles.copyBtn}>
            <Text style={styles.copyBtnText}>{copied ? 'Copied ✓' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
        <Text style={styles.codeText}>{code}</Text>
      </ScrollView>
    </View>
  );
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('chat');
  const [showModels, setShowModels] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null); 
  const [isModalVisible, setIsModalVisible] = useState(false); 
  
  const [apiKey, setApiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState(''); 
  const [userContext, setUserContext] = useState('');
  const [savedChats, setSavedChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(PROVIDERS[0].models[0]); 

  const [attachments, setAttachments] = useState([]); // Array of { type: 'image'|'video', preview: string, frames: string[], label: string }
  const [mediaNotice, setMediaNotice] = useState('');
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const slideAnim = useRef(new Animated.Value(-350)).current; 

  useEffect(() => {
    (async () => {
      try {
        const storedKey = await AsyncStorage.getItem('@council_api_key_v1');
        if (storedKey) setApiKey(storedKey);
        const storedAnthropic = await AsyncStorage.getItem('@council_anthropic_key_v1');
        if (storedAnthropic) setAnthropicKey(storedAnthropic);
        const storedChats = await AsyncStorage.getItem('@council_chats_v1');
        if (storedChats) setSavedChats(JSON.parse(storedChats));
        const storedContext = await AsyncStorage.getItem('@council_context_v1');
        if (storedContext) setUserContext(storedContext);
        const hideNotice = await AsyncStorage.getItem('@council_hide_api_notice');
        if (hideNotice === 'true') setDontShowAgain(true);
        else if (!storedKey && !storedAnthropic) setShowNoticeModal(true);
      } catch (err) {}
    })();
  }, []);

  const handleApiKeyChange = async (key) => { setApiKey(key); try { await AsyncStorage.setItem('@council_api_key_v1', key.trim()); } catch (e) {} };
  const handleAnthropicKeyChange = async (key) => { setAnthropicKey(key); try { await AsyncStorage.setItem('@council_anthropic_key_v1', key.trim()); } catch (e) {} };
  const handleContextChange = async (text) => { setUserContext(text); try { await AsyncStorage.setItem('@council_context_v1', text); } catch (e) {} };
  const toggleDontShowAgain = async () => { const v = !dontShowAgain; setDontShowAgain(v); try { await AsyncStorage.setItem('@council_hide_api_notice', v ? 'true' : 'false'); } catch (e) {} };
  const syncChatsWithStorage = async (list) => { setSavedChats(list); try { await AsyncStorage.setItem('@council_chats_v1', JSON.stringify(list)); } catch (e) {} };

  const openMenu = () => { setIsModalVisible(true); Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(); };
  const closeMenu = () => { Animated.timing(slideAnim, { toValue: -350, duration: 250, useNativeDriver: true }).start(() => setIsModalVisible(false)); };
  const startNewChat = () => { setActiveChatId(null); setMessages([]); setInputText(''); setAttachments([]); closeMenu(); };
  const selectChat = (chat) => { setActiveChatId(chat.id); setMessages(chat.messages); setAttachments([]); closeMenu(); };

  const deleteChat = async (id, e) => {
    e.stopPropagation();
    const updated = savedChats.filter(c => c.id !== id);
    if (activeChatId === id) { setActiveChatId(null); setMessages([]); }
    await syncChatsWithStorage(updated);
  };

  // --- IMAGE & VIDEO PICKER (MAX 70s VIDEO) ---
  const handlePickMedia = () => {
    setMediaNotice('');
    if (typeof document === 'undefined') {
      setMediaNotice('⚠️ Media attachments work on the live web app (tessarc.vercel.app).');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (file.type.startsWith('image/')) {
          setMediaNotice('Processing image...');
          const compressed = await compressImage(file);
          setAttachments(prev => [...prev, { type: 'image', preview: compressed, frames: [compressed], label: 'Photo' }]);
          setMediaNotice('');
        } else if (file.type.startsWith('video/')) {
          setMediaNotice('Checking video length & extracting frames...');
          const { frames, duration } = await processVideo(file);
          setAttachments(prev => [...prev, { type: 'video', preview: frames[0], frames, label: `🎬 ${duration}s Video` }]);
          setMediaNotice('');
        } else {
          setMediaNotice('⚠️ Please select an image or video.');
        }
      } catch (err) {
        setMediaNotice(`⚠️ ${err.message}`);
      }
    };
    input.click();
  };

  const sendMessage = async () => {
    if (!inputText.trim() && attachments.length === 0) return;
    setMediaNotice('');
    const currentId = activeChatId || Date.now().toString();
    if (!activeChatId) setActiveChatId(currentId);

    const allFrames = attachments.flatMap(a => a.frames);
    const hasVideo = attachments.some(a => a.type === 'video');
    const userText = inputText.trim() || (hasVideo ? 'What is happening in this video?' : 'Analyze this image.');
    
    const newUserMsg = { role: 'user', content: userText, images: allFrames };
    const chatHistory = [...messages, newUserMsg];
    setMessages(chatHistory);
    setInputText('');
    setAttachments([]);
    setIsLoading(true);

    const isClaudeModel = selectedModel.id.includes('claude');
    if (isClaudeModel && !anthropicKey.trim() && !apiKey.trim()) {
      setMessages([...chatHistory, { role: 'assistant', content: '⚠️ Add an Anthropic or OpenRouter Key in Settings.' }]);
      return setIsLoading(false);
    }
    if (!isClaudeModel && !apiKey.trim()) {
      setMessages([...chatHistory, { role: 'assistant', content: '⚠️ Add your OpenRouter API key in Settings (☰ > ⚙ Settings).' }]);
      return setIsLoading(false);
    }

    const attemptFetch = async () => {
      let systemPrompt = `You are Tessarc, a brilliant, witty, charismatic AI assistant powered by ${selectedModel.name}. Use emojis naturally 😂✨. When asked to create files or write code, ALWAYS put the filename in the code header like \`\`\`lua:speed.lua or \`\`\`html:index.html so the user can download it. Do not use markdown asterisks (**) in regular text.`;
      if (userContext.trim() !== '') systemPrompt += ` User Context: ${userContext}`;

      if (isClaudeModel && anthropicKey.trim()) {
        const formattedMsgs = chatHistory.map(m => {
          if (m.images && m.images.length > 0) {
            return {
              role: m.role,
              content: [
                ...m.images.map(url => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: url.split(',')[1] } })),
                { type: 'text', text: m.content }
              ]
            };
          }
          return { role: m.role, content: m.content };
        });

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey.trim(),
            "anthropic-version": "2023-06-05",
            "content-type": "application/json",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: selectedModel.id === 'anthropic/claude-3.7-sonnet' ? 'claude-3-7-sonnet-20250219' : 'claude-3-5-sonnet-20241022',
            max_tokens: 4000,
            system: systemPrompt,
            messages: formattedMsgs
          })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data?.error?.message || 'Anthropic API Error');
        return data.content[0].text;
      }

      const openRouterMsgs = chatHistory.map(m => {
        if (m.images && m.images.length > 0) {
          return {
            role: m.role,
            content: [
              { type: 'text', text: m.content },
              ...m.images.map(url => ({ type: 'image_url', image_url: { url } }))
            ]
          };
        }
        return { role: m.role, content: m.content };
      });

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey.trim() || anthropicKey.trim()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://tessarc.vercel.app",
          "X-Title": "Tessarc"
        },
        body: JSON.stringify({
          model: selectedModel.id,
          messages: [{ role: "system", content: systemPrompt }, ...openRouterMsgs]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data?.error?.message || 'API Error');
      return data.choices[0].message.content;
    };

    try {
      const aiReply = await attemptFetch();
      const finalHistory = [...chatHistory, { role: 'assistant', content: aiReply }];
      setMessages(finalHistory);
      saveSessionToHistory(currentId, finalHistory);
    } catch (e) {
      const tip = allFrames.length > 0 ? '\n\n💡 Tip: Ensure your selected model supports Vision (like GPT-4o, Gemini, or Claude).' : '';
      setMessages([...chatHistory, { role: 'assistant', content: `⚠️ Error: ${e.message}${tip}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSessionToHistory = (chatId, updatedMessages) => {
    let list = [...savedChats];
    const firstUserMsg = updatedMessages.find(m => m.role === 'user');
    const autoTitle = firstUserMsg ? firstUserMsg.content.slice(0, 28) : 'Conversation';
    const index = list.findIndex(c => c.id === chatId);
    if (index >= 0) list[index] = { ...list[index], messages: updatedMessages };
    else list.unshift({ id: chatId, title: autoTitle, messages: updatedMessages });
    syncChatsWithStorage(list);
  };

  const renderMessageContent = (item) => {
    const content = item.content || '';
    const parts = content.split(/(```[\s\S]*?```)/g);

    return (
      <View>
        {item.images && item.images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {item.images.map((uri, idx) => (
              <Image key={idx} source={{ uri }} style={styles.msgImageThumb} />
            ))}
          </ScrollView>
        )}
        {parts.map((part, index) => {
          if (part.startsWith('```') && part.endsWith('```')) {
            const firstBreak = part.indexOf('\n');
            let lang = 'txt';
            let filename = 'tessarc-file.txt';
            let code = '';
            if (firstBreak !== -1) {
              const header = part.slice(3, firstBreak).trim();
              const [rawLang, rawFile] = header.split(':');
              lang = (rawLang || 'txt').trim().toLowerCase();
              const ext = EXT_MAP[lang] || 'txt';
              filename = rawFile ? rawFile.trim() : `tessarc-file.${ext}`;
              code = part.slice(firstBreak + 1, -3).trim();
            } else {
              code = part.slice(3, -3).trim();
            }
            return <CodeBlock key={index} code={code} filename={filename} language={lang} />;
          }
          const cleanText = part.replace(/\*\*/g, '');
          if (!cleanText.trim()) return null;
          return <Text key={index} style={styles.msgText}>{cleanText}</Text>;
        })}
      </View>
    );
  };

  if (currentScreen === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setCurrentScreen('chat')}><Text style={styles.headerIcon}>←</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{width: 30}} />
        </View>
        <ScrollView style={styles.settingsContent}>
          <Text style={styles.sectionLabel}>OPENROUTER API KEY (OPTIONAL)</Text>
          <Text style={styles.helperText}>Used for Free models, GPT-4o, Gemini, DeepSeek, and Llama.</Text>
          <TextInput style={styles.keyInput} value={apiKey} onChangeText={handleApiKeyChange} placeholder="sk-or-v1-..." placeholderTextColor="#444" autoCapitalize="none" autoCorrect={false} />
          <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL('https://openrouter.ai/keys')}><Text style={styles.linkButtonText}>Get OpenRouter Key ↗</Text></TouchableOpacity>
          <View style={{height: 10}} />
          <Text style={styles.sectionLabel}>ANTHROPIC (CLAUDE) API KEY</Text>
          <Text style={styles.helperText}>Direct native key for Claude 3.7 Sonnet.</Text>
          <TextInput style={styles.keyInput} value={anthropicKey} onChangeText={handleAnthropicKeyChange} placeholder="sk-ant-..." placeholderTextColor="#444" autoCapitalize="none" autoCorrect={false} />
          <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}><Text style={styles.linkButtonText}>Get Anthropic Claude Key ↗</Text></TouchableOpacity>
          <View style={{height: 20}} />
          <Text style={styles.sectionLabel}>CUSTOM INSTRUCTIONS</Text>
          <TextInput style={styles.contextInput} value={userContext} onChangeText={handleContextChange} multiline placeholder="e.g., Explain things simply..." placeholderTextColor="#444" />
          <View style={{height: 60}} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.header}>
        <TouchableOpacity onPress={openMenu}><Text style={styles.headerIcon}>☰</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { setSelectedCompany(null); setShowModels(!showModels); }} style={styles.modelBtn}><Text style={styles.modelBtnText} numberOfLines={1}>{selectedModel.name} ▾</Text></TouchableOpacity>
        <TouchableOpacity onPress={startNewChat}><Text style={styles.headerIcon}>＋</Text></TouchableOpacity>
      </View>

      <Modal visible={showNoticeModal && !apiKey && !anthropicKey && !dontShowAgain} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.noticeCard}>
            <Text style={styles.noticeHeader}>🔑 Setup Required</Text>
            <Text style={styles.noticeBody}>To chat with models, please add an OpenRouter or Anthropic API key in Settings.</Text>
            <TouchableOpacity style={styles.noticeBtnPrimary} onPress={() => { setShowNoticeModal(false); setCurrentScreen('settings'); }}><Text style={styles.noticeBtnPrimaryText}>Go to Settings ⚙</Text></TouchableOpacity>
            <TouchableOpacity style={styles.noticeBtnSecondary} onPress={() => Linking.openURL('https://openrouter.ai/keys')}><Text style={styles.noticeBtnSecondaryText}>Get OpenRouter Key ↗</Text></TouchableOpacity>
            <TouchableOpacity style={styles.checkboxContainer} onPress={toggleDontShowAgain}>
              <View style={[styles.checkboxBox, dontShowAgain && styles.checkboxChecked]}>{dontShowAgain && <Text style={styles.checkboxCheck}>✓</Text>}</View>
              <Text style={styles.checkboxLabel}>Don't show this again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.noticeDismiss} onPress={() => setShowNoticeModal(false)}><Text style={styles.noticeDismissText}>Dismiss</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showModels && (
        <View style={styles.modelDropdown}>
          {!selectedCompany ? (
            <View>
              <View style={styles.dropdownHeader}><Text style={styles.dropdownHeaderTitle}>Select Provider</Text><TouchableOpacity onPress={() => setShowModels(false)}><Text style={styles.dropdownCloseBtn}>✕</Text></TouchableOpacity></View>
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {PROVIDERS.map((provider) => (
                  <TouchableOpacity key={provider.id} style={styles.providerRow} onPress={() => setSelectedCompany(provider)}>
                    <Text style={styles.providerRowText}>{provider.name}</Text><Text style={styles.providerChevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View>
              <View style={styles.dropdownHeader}>
                <TouchableOpacity onPress={() => setSelectedCompany(null)} style={styles.backRow}><Text style={styles.backArrow}>‹</Text><Text style={styles.dropdownHeaderTitle}>{selectedCompany.name}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { setSelectedCompany(null); setShowModels(false); }}><Text style={styles.dropdownCloseBtn}>✕</Text></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {selectedCompany.models.map((m) => {
                  const isSelected = selectedModel.id === m.id;
                  return (
                    <TouchableOpacity key={m.id} style={[styles.modelRow, isSelected && styles.selectedModelRow]} onPress={() => { setSelectedModel(m); setSelectedCompany(null); setShowModels(false); }}>
                      <Text style={[styles.modelRowText, isSelected && styles.selectedModelRowText]}>{m.name}</Text>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      <Modal visible={isModalVisible} transparent={true} animationType="fade">
        <View style={styles.menuOverlay}>
          <Animated.View style={[styles.menuContent, { transform: [{ translateX: slideAnim }] }]}>
            <TouchableOpacity style={styles.newChatBtn} onPress={startNewChat}><Text style={styles.newChatBtnText}>＋ New Chat</Text></TouchableOpacity>
            <Text style={styles.historyHeading}>RECENTS</Text>
            <ScrollView style={styles.chatListScroll} showsVerticalScrollIndicator={false}>
              {savedChats.length === 0 ? <Text style={styles.emptyHistoryText}>No chats yet.</Text> : savedChats.map(c => (
                <TouchableOpacity key={c.id} style={[styles.historyItem, activeChatId === c.id && styles.activeHistoryItem]} onPress={() => selectChat(c)}>
                  <Text style={[styles.historyItemText, activeChatId === c.id && styles.activeHistoryItemText]} numberOfLines={1}>{c.title}</Text>
                  <TouchableOpacity onPress={(e) => deleteChat(c.id, e)} style={styles.deleteBtn}><Text style={styles.deleteBtnText}>✕</Text></TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.menuFooter}><TouchableOpacity style={styles.settingsRow} onPress={() => { closeMenu(); setCurrentScreen('settings'); }}><Text style={styles.settingsRowText}>⚙ Settings</Text></TouchableOpacity></View>
          </Animated.View>
          <Pressable style={styles.menuCloseArea} onPress={closeMenu} />
        </View>
      </Modal>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ flex: 1 }}>
        <FlatList
          key="chat-list"
          data={isLoading ? [...messages, { role: 'thinking' }] : messages}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => item.role === 'thinking' ? <ThinkingIndicator /> : <View style={item.role === 'user' ? styles.userMsg : styles.aiMsg}>{renderMessageContent(item)}</View>}
          contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'flex-end' }}
          ListEmptyComponent={() => <View style={styles.emptyChat}><Text style={styles.emptyLogo}>✧</Text><Text style={styles.emptyChatText}>How can I help?</Text></View>}
        />

        {mediaNotice ? <Text style={styles.mediaNoticeText}>{mediaNotice}</Text> : null}

        {attachments.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewBar}>
            {attachments.map((att, idx) => (
              <View key={idx} style={styles.previewCard}>
                <Image source={{ uri: att.preview }} style={styles.previewThumb} />
                <Text style={styles.previewLabel}>{att.label}</Text>
                <TouchableOpacity onPress={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} style={styles.removeAttBtn}>
                  <Text style={styles.removeAttText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}>
            <Text style={styles.attachTxt}>📎</Text>
          </TouchableOpacity>
          <TextInput style={styles.input} value={inputText} onChangeText={setInputText} placeholder="Message..." placeholderTextColor="#666" />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={isLoading}><Text style={[styles.sendTxt, { opacity: isLoading ? 0.3 : 1 }]}>↑</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#111' },
  headerIcon: { color: '#FFF', fontSize: 24, padding: 5 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  modelBtn: { backgroundColor: '#111', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, maxWidth: 210 },
  modelBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  modelDropdown: { backgroundColor: '#161618', position: 'absolute', top: 70, alignSelf: 'center', zIndex: 20, borderRadius: 18, width: 270, borderWidth: 1, borderColor: '#2A2A2E', overflow: 'hidden' },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#1C1C1F' },
  dropdownHeaderTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  dropdownCloseBtn: { color: '#888', fontSize: 14, padding: 4 },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backArrow: { color: '#4A90E2', fontSize: 20, fontWeight: '800', marginRight: 6 },
  providerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#202022' },
  providerRowText: { color: '#DDD', fontSize: 14, fontWeight: '600' },
  providerChevron: { color: '#555', fontSize: 18 },
  modelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#202022' },
  selectedModelRow: { backgroundColor: '#202026' },
  modelRowText: { color: '#CCC', fontSize: 14 },
  selectedModelRowText: { color: '#FFF', fontWeight: '700' },
  checkmark: { color: '#4A90E2', fontSize: 14, fontWeight: 'bold' },
  menuOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)' },
  menuContent: { width: '80%', backgroundColor: '#0A0A0A', padding: 20, paddingTop: 50, borderRightWidth: 1, borderRightColor: '#222' },
  menuCloseArea: { flex: 1 }, 
  newChatBtn: { backgroundColor: '#FFF', paddingVertical: 14, borderRadius: 100, alignItems: 'center', marginBottom: 25 },
  newChatBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  historyHeading: { color: '#666', fontSize: 11, fontWeight: '800', marginBottom: 15 },
  chatListScroll: { flex: 1 },
  emptyHistoryText: { color: '#444', fontSize: 14, fontStyle: 'italic' },
  historyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, marginBottom: 6 },
  activeHistoryItem: { backgroundColor: '#1A1A1A' },
  historyItemText: { color: '#BBB', fontSize: 15, flex: 1 },
  activeHistoryItemText: { color: '#FFF', fontWeight: '600' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: '#555', fontSize: 12 },
  menuFooter: { borderTopWidth: 1, borderTopColor: '#222', paddingTop: 15 },
  settingsRowText: { color: '#FFF', fontSize: 16 },
  settingsContent: { padding: 20 },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  helperText: { color: '#555', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  keyInput: { backgroundColor: '#111', color: '#FFF', fontSize: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#222', marginBottom: 12 },
  linkButton: { backgroundColor: '#1C1C1E', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  linkButtonText: { color: '#4A90E2', fontSize: 14, fontWeight: '700' },
  contextInput: { backgroundColor: '#111', color: '#FFF', fontSize: 15, minHeight: 120, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#222', textAlignVertical: 'top' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 25 },
  noticeCard: { backgroundColor: '#141416', width: '100%', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#252528' },
  noticeHeader: { color: '#FFF', fontSize: 19, fontWeight: '800', marginBottom: 10 },
  noticeBody: { color: '#AAA', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  noticeBtnPrimary: { backgroundColor: '#FFF', paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  noticeBtnPrimaryText: { color: '#000', fontSize: 15, fontWeight: '700' },
  noticeBtnSecondary: { backgroundColor: '#202024', paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  noticeBtnSecondaryText: { color: '#4A90E2', fontSize: 14, fontWeight: '700' },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkboxBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#555', marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
  checkboxCheck: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  checkboxLabel: { color: '#888', fontSize: 13 },
  noticeDismiss: { alignItems: 'center', paddingVertical: 6 },
  noticeDismissText: { color: '#666', fontSize: 13, fontWeight: '600' },
  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyLogo: { fontSize: 40, color: '#333' },
  emptyChatText: { color: '#555', fontSize: 18 },
  userMsg: { alignSelf: 'flex-end', backgroundColor: '#1A1A1A', padding: 16, borderRadius: 24, borderBottomRightRadius: 4, marginVertical: 8, maxWidth: '85%' },
  aiMsg: { alignSelf: 'flex-start', padding: 16, marginVertical: 8, maxWidth: '95%' },
  msgText: { color: '#FFF', fontSize: 16, lineHeight: 26 },
  msgImageThumb: { width: 90, height: 90, borderRadius: 12, marginRight: 8, backgroundColor: '#111' },
  codeContainer: { backgroundColor: '#0D0D10', borderRadius: 14, borderWidth: 1, borderColor: '#222', marginVertical: 10, overflow: 'hidden' },
  codeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#151518', borderBottomWidth: 1, borderBottomColor: '#202025' },
  codeLang: { color: '#888', fontSize: 12, fontWeight: '700', flex: 1, marginRight: 8 },
  copyBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#202026' },
  saveBtnText: { color: '#4A90E2', fontSize: 12, fontWeight: '700' },
  copyBtnText: { color: '#CCC', fontSize: 12, fontWeight: '600' },
  codeScroll: { padding: 14 },
  codeText: { color: '#E0E0E0', fontSize: 14, lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  mediaNoticeText: { color: '#F5A623', fontSize: 12, paddingHorizontal: 20, paddingVertical: 6 },
  previewBar: { maxHeight: 74, paddingHorizontal: 15, paddingVertical: 6, backgroundColor: '#080808', borderTopWidth: 1, borderTopColor: '#151515' },
  previewCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161618', borderRadius: 12, padding: 6, marginRight: 10, borderWidth: 1, borderColor: '#252528' },
  previewThumb: { width: 44, height: 44, borderRadius: 8, marginRight: 8 },
  previewLabel: { color: '#CCC', fontSize: 12, fontWeight: '600', marginRight: 8 },
  removeAttBtn: { padding: 4 },
  removeAttText: { color: '#888', fontSize: 14, fontWeight: 'bold' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 15, paddingBottom: 20, backgroundColor: '#000', borderTopWidth: 1, borderTopColor: '#111' },
  attachBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#161618', justifyContent: 'center', alignItems: 'center', marginRight: 8, borderWidth: 1, borderColor: '#252528' },
  attachTxt: { fontSize: 18 },
  input: { flex: 1, backgroundColor: '#1A1A1A', color: '#FFF', paddingHorizontal: 18, paddingVertical: 13, borderRadius: 30, fontSize: 16, borderWidth: 1, borderColor: '#222' },
  sendBtn: { marginLeft: 8, backgroundColor: '#FFF', width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  sendTxt: { color: '#000', fontSize: 22, fontWeight: 'bold' }
});
