import React, { useState, useRef, useEffect } from 'react';
import { 
  Layout, 
  Card, 
  Input, 
  Button, 
  message, 
  Spin, 
  Tabs, 
  Space,
  Typography,
  Tag,
  Divider,
  ConfigProvider,
  theme,
  Tooltip,
  Empty
} from 'antd';
import { 
  SendOutlined, 
  ClearOutlined,
  DownloadOutlined,
  DeleteOutlined,
  SunOutlined,
  MoonOutlined,
  CloudServerOutlined,
  AlertOutlined,
  SolutionOutlined,
  FileSearchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HistoryOutlined,
  PlusOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

const API_BASE_URL = 'http://39.96.7.131:8000/api';
const STORAGE_KEY = 'root_cause_history_sessions';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  taskId?: string;
  type?: 'log' | 'report';
}

interface HistorySession {
  id: string;
  title: string;
  createTime: number;
  messages: Message[];
  alarmFileName?: string;
  workorderFileName?: string;
}

interface UploadedFile {
  name: string;
  size: number;
  content: string;
  rawFile: File;
}

const App: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [alarmFile, setAlarmFile] = useState<UploadedFile | null>(null);
  const [workorderFile, setWorkorderFile] = useState<UploadedFile | null>(null);
  
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') !== 'light';
  });

  // ========== 历史会话状态 ==========
  const [siderCollapsed, setSiderCollapsed] = useState<boolean>(false);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const alarmFileRef = useRef<HTMLInputElement>(null);
  const workorderFileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化：从本地存储加载历史会话
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
      }
    } catch (e) {
      console.error('加载历史记录失败', e);
    }
  }, []);

  // 会话变化时自动持久化1
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error('保存历史记录失败', e);
    }
  }, [sessions]);

  // 主题持久化
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // 当前会话的消息列表12
  const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ========== 会话操作方法 ==========
  const createNewSession = (alarmName?: string, workorderName?: string): string => {
    const sessionId = `session_${Date.now()}`;
    const newSession: HistorySession = {
      id: sessionId,
      title: `根因分析任务`,
      createTime: Date.now(),
      messages: [],
      alarmFileName: alarmName,
      workorderFileName: workorderName
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(sessionId);
    return sessionId;
  };

  const updateSessionMessages = (sessionId: string, updater: (msgs: Message[]) => Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        return { ...s, messages: updater(s.messages) };
      }
      return s;
    }));
  };

  const updateSessionTaskId = (sessionId: string, taskId: string) => {
    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        return { ...s, id: taskId, title: `任务 ${taskId}` };
      }
      return s;
    }));
    setCurrentSessionId(taskId);
  };

  const deleteSession = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
    message.success('已删除该历史记录');
  };

  const clearAllSessions = () => {
    setSessions([]);
    setCurrentSessionId(null);
    message.success('已清空所有历史记录');
  };

  const readFile = (file: File, callback: (result: UploadedFile) => void) => {
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error(`文件大小不能超过100MB，当前文件大小: ${formatFileSize(file.size)}`);
      return;
    }

    const allowedExtensions = ['.txt', '.log', '.csv', '.json', '.md', '.jsonl'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      message.error(`不支持的文件格式，请上传 ${allowedExtensions.join(', ')} 文件`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      callback({
        name: file.name,
        size: file.size,
        content: content,
        rawFile: file
      });
      message.success(`文件 "${file.name}" 上传成功`);
    };
    reader.onerror = () => {
      message.error('文件读取失败，请检查文件是否损坏');
    };
    reader.readAsText(file);
  };

  const handleAlarmFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    readFile(files[0], (result) => setAlarmFile(result));
    e.target.value = '';
  };

  const handleWorkorderFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    readFile(files[0], (result) => setWorkorderFile(result));
    e.target.value = '';
  };

  const deleteAlarmFile = () => {
    setAlarmFile(null);
    message.info('告警文件已删除');
  };

  const deleteWorkorderFile = () => {
    setWorkorderFile(null);
    message.info('工单文件已删除');
  };

  const sendToLLM = async (displayContent: string) => {
    setIsLoading(true);
    
    // 创建新会话
    const sessionId = createNewSession(
      alarmFile?.name,
      workorderFile?.name
    );

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: displayContent,
      timestamp: new Date()
    };
    
    updateSessionMessages(sessionId, msgs => [...msgs, userMessage]);
    setInputText('');
    const currentAlarm = alarmFile;
    const currentWorkorder = workorderFile;
    setAlarmFile(null);
    setWorkorderFile(null);
    
    const assistantMessageId = (Date.now() + 1).toString();
    updateSessionMessages(sessionId, msgs => [...msgs, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      type: 'log'
    }]);

    try {
      const formData = new FormData();
      formData.append('prompt', inputText);
      if (currentAlarm) {
        formData.append('alarm_file', currentAlarm.rawFile, currentAlarm.name);
      }
      if (currentWorkorder) {
        formData.append('workorder_file', currentWorkorder.rawFile, currentWorkorder.name);
      }

      // 第一步：提交任务，立即获取任务ID（短请求，不会超时）
      const submitResponse = await fetch(`${API_BASE_URL}/llm/analyze`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000)
      });

      if (!submitResponse.ok) {
        throw new Error(`HTTP error! status: ${submitResponse.status}`);
      }

      const { task_id: serverTaskId } = await submitResponse.json();

      // 第二步：轮询拉取任务日志，模拟流式效果
      let lastLogLength = 0;
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE_URL}/task/${serverTaskId}/status`, {
            signal: AbortSignal.timeout(10000)
          });

          if (!statusRes.ok) {
            throw new Error(`状态查询失败: ${statusRes.status}`);
          }

          const statusData = await statusRes.json();
          const fullLog = statusData.log;
          const newContent = fullLog.slice(lastLogLength);
          lastLogLength = fullLog.length;

          // 有新日志则追加到界面
          if (newContent) {
            // 识别任务完成标记
            if (newContent.includes('__TASK_DONE__:')) {
              const [contentPart, taskPart] = newContent.split('__TASK_DONE__:');
              
              if (contentPart) {
                updateSessionMessages(sessionId, msgs => msgs.map(msg => 
                  msg.id === assistantMessageId 
                    ? { ...msg, content: msg.content + contentPart }
                    : msg
                ));
              }
              
              const realTaskId = taskPart.trim();
              updateSessionMessages(sessionId, msgs => msgs.map(msg => 
                msg.id === assistantMessageId 
                  ? { ...msg, taskId: realTaskId }
                  : msg
              ));
              updateSessionTaskId(sessionId, realTaskId);

              clearInterval(pollInterval);
              setIsLoading(false);
              return;
            }

            updateSessionMessages(sessionId, msgs => msgs.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: msg.content + newContent }
                : msg
            ));
          }

          // 任务标记为完成时，停止轮询
          if (statusData.done) {
            clearInterval(pollInterval);
            setIsLoading(false);
          }

        } catch (err) {
          console.error('轮询出错:', err);
          // 单次轮询失败不中断，继续下一次拉取
        }
      }, 2000); // 每2秒拉取一次进度

    } catch (error) {
      console.error('API调用失败:', error);
      message.error('调用分析服务失败，请检查后端服务是否正常运行');
      
      updateSessionMessages(sessionId, msgs => msgs.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, content: '**错误：** 无法连接到后端服务，请检查网络连接或后端服务状态。' }
          : msg
      ));
      setIsLoading(false);
    }
  };

  const handleGenerateReport = async (taskId: string) => {
    if (!currentSessionId) return;

    const reportMessageId = Date.now().toString();
    const query = inputText.trim();
    
    updateSessionMessages(currentSessionId, msgs => [...msgs, {
      id: reportMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      type: 'report'
    }]);

    setInputText('');

    try {
      const formData = new FormData();
      formData.append('task_id', taskId);
      formData.append('user_query', query);

      const response = await fetch(`${API_BASE_URL}/llm/generate-report`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(180000)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        updateSessionMessages(currentSessionId, msgs => msgs.map(msg => 
          msg.id === reportMessageId 
            ? { ...msg, content: msg.content + chunk }
            : msg
        ));
      }
    } catch (error) {
      console.error('生成报告失败:', error);
      message.error('生成分析报告失败，请检查大模型配置');
      
      updateSessionMessages(currentSessionId, msgs => msgs.map(msg => 
        msg.id === reportMessageId 
          ? { ...msg, content: '**错误：** 生成分析报告失败，请检查后端大模型配置是否正确。' }
          : msg
      ));
    }
  };

  const handleSubmit = () => {
    if (!inputText.trim() && !alarmFile && !workorderFile) {
      message.warning('请输入文本或上传至少一个数据文件');
      return;
    }
    
    let displayContent = '';
    if (inputText.trim()) {
      displayContent += inputText;
    }
    if (alarmFile) {
      if (displayContent) displayContent += '\n\n';
      displayContent += `🚨 告警文件：${alarmFile.name}（${formatFileSize(alarmFile.size)}）`;
    }
    if (workorderFile) {
      if (displayContent) displayContent += '\n\n';
      displayContent += `📋 工单文件：${workorderFile.name}（${formatFileSize(workorderFile.size)}）`;
    }
    
    sendToLLM(displayContent);
  };

  const handleClearCurrent = () => {
    if (!currentSessionId) return;
    updateSessionMessages(currentSessionId, () => []);
    message.info('当前对话已清空');
  };

  const themeConfig = {
    algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#1677ff',
      borderRadius: 6,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    components: {
      Card: {
        boxShadow: isDarkMode 
          ? '0 1px 2px 0 rgba(0, 0, 0, 0.3), 0 1px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px 0 rgba(0, 0, 0, 0.2)'
          : '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
      },
      Button: {
        borderRadius: 6,
        controlHeight: 36,
      },
      Input: {
        borderRadius: 6,
      },
      Tabs: {
        borderRadius: 6,
      }
    }
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout style={{ minHeight: '100vh', background: isDarkMode ? '#0f1419' : '#f5f7fa' }}>
        <Header style={{ 
          background: isDarkMode ? '#161b22' : '#ffffff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: isDarkMode 
            ? '0 1px 0 rgba(255, 255, 255, 0.08)' 
            : '0 1px 2px rgba(0, 0, 0, 0.05)',
          borderBottom: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setSiderCollapsed(!siderCollapsed)}
              style={{ marginRight: '16px' }}
            />
            <CloudServerOutlined style={{ fontSize: '28px', color: '#1677ff', marginRight: '12px' }} />
            <Title level={4} style={{ 
              color: isDarkMode ? '#f0f6fc' : '#1f2329', 
              margin: 0,
              fontWeight: 600
            }}>
              LLM 根因定位与分析系统
            </Title>
            <Tag color="blue" style={{ marginLeft: '16px', fontSize: '12px' }}>v1.0</Tag>
          </div>
          
          <Button 
            type="text"
            icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{ fontSize: '18px' }}
          />
        </Header>
        
        <Layout>
          {/* 左侧历史记录边栏 */}
          <Sider
            width={260}
            collapsed={siderCollapsed}
            collapsedWidth={0}
            style={{
              background: isDarkMode ? '#161b22' : '#ffffff',
              borderRight: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8',
              overflow: 'hidden',
              transition: 'all 0.2s'
            }}
          >
            <div style={{
              padding: '16px',
              borderBottom: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <Text strong style={{ fontSize: '15px' }}>
                <HistoryOutlined style={{ marginRight: '8px' }} />
                历史任务
              </Text>
              <Space size="small">
                <Tooltip title="新建任务">
                  <Button
                    type="text"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => setCurrentSessionId(null)}
                  />
                </Tooltip>
                <Tooltip title="清空全部">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<ClearOutlined />}
                    onClick={clearAllSessions}
                    disabled={sessions.length === 0}
                  />
                </Tooltip>
              </Space>
            </div>

            <div style={{ height: 'calc(100vh - 120px)', overflowY: 'auto', padding: '8px' }}>
              {sessions.length === 0 ? (
                <Empty
                  description="暂无历史记录"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ marginTop: '60px' }}
                />
              ) : (
                sessions.map(session => (
                  <div
                    key={session.id}
                    onClick={() => setCurrentSessionId(session.id)}
                    style={{
                      padding: '12px',
                      marginBottom: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: currentSessionId === session.id
                        ? (isDarkMode ? '#1f6feb26' : '#e6f4ff')
                        : 'transparent',
                      border: currentSessionId === session.id
                        ? `1px solid ${isDarkMode ? '#1f6feb' : '#91caff'}`
                        : `1px solid ${isDarkMode ? '#30363d' : '#f0f0f0'}`,
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
                          {session.title}
                        </Text>
                        <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                          {formatTime(session.createTime)}
                        </Text>
                        {session.alarmFileName && (
                          <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginTop: '2px' }}>
                            🚨 {session.alarmFileName}
                          </Text>
                        )}
                        {session.workorderFileName && (
                          <Text type="secondary" style={{ fontSize: '11px', display: 'block' }}>
                            📋 {session.workorderFileName}
                          </Text>
                        )}
                      </div>
                      <Tooltip title="删除">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          style={{ padding: '0 4px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
                        />
                      </Tooltip>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Sider>

          <Content style={{ padding: '24px' }}>
            <div style={{ 
              maxWidth: '1400px', 
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: '1fr 1.2fr',
              gap: '24px',
              height: 'calc(100vh - 112px)'
            }}>
              <Card 
                title="数据输入" 
                bordered={false}
                styles={{
                  body: { 
                    padding: '20px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    height: '100%',
                    overflow: 'hidden'
                  }
                }}
                extra={
                  <Button 
                    icon={<ClearOutlined />} 
                    onClick={() => {
                      setInputText('');
                      setAlarmFile(null);
                      setWorkorderFile(null);
                    }}
                    disabled={isLoading}
                  >
                    清空
                  </Button>
                }
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <Space style={{ marginBottom: '16px' }} wrap>
                    <input
                      type="file"
                      ref={alarmFileRef}
                      onChange={handleAlarmFileChange}
                      accept=".txt,.log,.csv,.json,.md,.jsonl"
                      style={{ display: 'none' }}
                    />
                    <Button 
                      type="primary"
                      ghost
                      icon={<AlertOutlined />} 
                      onClick={() => alarmFileRef.current?.click()}
                      disabled={isLoading}
                    >
                      上传告警文件
                    </Button>

                    <input
                      type="file"
                      ref={workorderFileRef}
                      onChange={handleWorkorderFileChange}
                      accept=".txt,.log,.csv,.json,.md,.jsonl"
                      style={{ display: 'none' }}
                    />
                    <Button 
                      type="primary"
                      ghost
                      icon={<SolutionOutlined />} 
                      onClick={() => workorderFileRef.current?.click()}
                      disabled={isLoading}
                    >
                      上传工单文件
                    </Button>
                  </Space>

                  {alarmFile && (
                    <div style={{ 
                      padding: '12px 14px', 
                      background: isDarkMode ? '#1c2128' : '#fff1f0', 
                      borderRadius: '8px', 
                      marginBottom: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: isDarkMode ? '1px solid #30363d' : '1px solid #ffccc7'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <AlertOutlined style={{ fontSize: '18px', color: '#ff4d4f', marginRight: '10px' }} />
                        <div>
                          <Text strong style={{ fontSize: '13px' }}>告警文件：{alarmFile.name}</Text>
                          <div>
                            <Tag color="red" style={{ marginTop: '4px', fontSize: '12px' }}>
                              {formatFileSize(alarmFile.size)}
                            </Tag>
                          </div>
                        </div>
                      </div>
                      <Button 
                        type="text" 
                        size="small"
                        danger 
                        icon={<DeleteOutlined />} 
                        onClick={deleteAlarmFile}
                        title="删除文件"
                      />
                    </div>
                  )}

                  {workorderFile && (
                    <div style={{ 
                      padding: '12px 14px', 
                      background: isDarkMode ? '#1c2128' : '#e6f7ff', 
                      borderRadius: '8px', 
                      marginBottom: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: isDarkMode ? '1px solid #30363d' : '1px solid #91caff'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <SolutionOutlined style={{ fontSize: '18px', color: '#1677ff', marginRight: '10px' }} />
                        <div>
                          <Text strong style={{ fontSize: '13px' }}>工单文件：{workorderFile.name}</Text>
                          <div>
                            <Tag color="blue" style={{ marginTop: '4px', fontSize: '12px' }}>
                              {formatFileSize(workorderFile.size)}
                            </Tag>
                          </div>
                        </div>
                      </div>
                      <Button 
                        type="text" 
                        size="small"
                        danger 
                        icon={<DeleteOutlined />} 
                        onClick={deleteWorkorderFile}
                        title="删除文件"
                      />
                    </div>
                  )}

                  <Tabs
                    items={[
                      {
                        key: 'text',
                        label: '补充说明 / 提问',
                        children: (
                          <TextArea
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="运行前可填写补充说明；任务完成后可输入问题继续追问，基于已有结果数据解答..."
                            rows={8}
                            style={{ marginBottom: '16px' }}
                            disabled={isLoading}
                            autoSize={{ minRows: 8, maxRows: 12 }}
                          />
                        )
                      },
                      {
                        key: 'preview',
                        label: '文件内容预览',
                        children: (
                          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {alarmFile ? (
                              <div>
                                <Text strong style={{ fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                                  🚨 告警文件内容
                                </Text>
                                <TextArea
                                  value={alarmFile.content.length > 50000 
                                    ? alarmFile.content.substring(0, 50000) + '\n...（内容过长，预览已截断）'
                                    : alarmFile.content}
                                  readOnly
                                  rows={6}
                                  style={{ marginBottom: '8px' }}
                                />
                              </div>
                            ) : (
                              <Text type="secondary" style={{ fontSize: '13px' }}>未上传告警文件</Text>
                            )}
                            
                            {workorderFile ? (
                              <div>
                                <Text strong style={{ fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                                  📋 工单文件内容
                                </Text>
                                <TextArea
                                  value={workorderFile.content.length > 50000 
                                    ? workorderFile.content.substring(0, 50000) + '\n...（内容过长，预览已截断）'
                                    : workorderFile.content}
                                  readOnly
                                  rows={6}
                                />
                              </div>
                            ) : (
                              <Text type="secondary" style={{ fontSize: '13px' }}>未上传工单文件</Text>
                            )}
                          </div>
                        )
                      }
                    ]}
                  />
                  
                  <Divider style={{ margin: '12px 0' }} />
                  
                  <Button 
                    type="primary" 
                    size="large"
                    icon={<SendOutlined />}
                    onClick={handleSubmit}
                    loading={isLoading}
                    style={{ marginTop: 'auto', height: '44px', fontSize: '15px', fontWeight: 500 }}
                    block
                  >
                    {isLoading ? '分析任务运行中...' : '开始根因定位分析'}
                  </Button>
                </div>
              </Card>
              
              <Card 
                title="分析结果" 
                bordered={false}
                styles={{
                  body: { 
                    padding: '20px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    height: '100%',
                    overflow: 'hidden'
                  }
                }}
                extra={
                  <Button 
                    icon={<ClearOutlined />} 
                    onClick={handleClearCurrent}
                    disabled={currentMessages.length === 0 || isLoading}
                    size="small"
                  >
                    清空当前
                  </Button>
                }
              >
                <div style={{ 
                  flex: 1, 
                  overflowY: 'auto',
                  padding: '0 8px',
                  scrollBehavior: 'smooth'
                }}>
                  {!currentSessionId || currentMessages.length === 0 ? (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '120px 0',
                      color: isDarkMode ? '#8b949e' : '#999'
                    }}>
                      <CloudServerOutlined style={{ fontSize: '64px', marginBottom: '20px', opacity: 0.2 }} />
                      <Title level={4} style={{ color: isDarkMode ? '#8b949e' : '#999', marginBottom: '12px' }}>
                        开始根因定位分析
                      </Title>
                      <Paragraph type="secondary">
                        在左侧上传告警数据和工单数据文件
                      </Paragraph>
                      <Paragraph type="secondary">
                        点击"开始根因定位分析"按钮获取专业的故障分析报告
                      </Paragraph>
                    </div>
                  ) : (
                    currentMessages.map((msg) => (
                      <div 
                        key={msg.id}
                        style={{
                          marginBottom: '24px',
                          borderRadius: '10px',
                          background: msg.role === 'user' 
                            ? (isDarkMode ? '#1c2128' : '#e6f4ff') 
                            : (isDarkMode ? '#161b22' : '#ffffff'),
                          border: msg.role === 'user'
                            ? (isDarkMode ? '1px solid #30363d' : '1px solid #91caff')
                            : (isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'),
                          boxShadow: isDarkMode 
                            ? '0 1px 3px rgba(0, 0, 0, 0.3)' 
                            : '0 2px 8px rgba(0, 0, 0, 0.06)',
                          overflow: 'hidden'
                        }}
                      >
                        <div style={{ 
                          padding: '12px 16px',
                          background: msg.role === 'user'
                            ? (isDarkMode ? '#2386361a' : '#1677ff0a')
                            : (isDarkMode ? '#2386361a' : '#52c41a0a'),
                          borderBottom: msg.role === 'user'
                            ? (isDarkMode ? '1px solid #30363d' : '1px solid #bae0ff')
                            : (isDarkMode ? '1px solid #30363d' : '1px solid #b7eb8f'),
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ fontSize: '16px', marginRight: '8px' }}>
                              {msg.role === 'user' ? '👤' : '🤖'}
                            </span>
                            <Text strong style={{ fontSize: '14px' }}>
                              {msg.role === 'user' ? '输入数据' : (msg.type === 'report' ? 'AI分析报告' : '运行日志')}
                            </Text>
                          </div>
                          <Text type="secondary" style={{ fontSize: '12px' }}>
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </Text>
                        </div>
                        
                        <div style={{ 
                          padding: '16px',
                          lineHeight: '1.7',
                          color: isDarkMode ? '#f0f6fc' : '#1f2329'
                        }}>
                          {msg.role === 'assistant' ? (
                            <div>
                              {msg.type === 'report' ? (
                                <div className="markdown-body">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.content}
                                  </ReactMarkdown>
                                </div>
                              ) : (
                                <pre style={{
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  margin: 0,
                                  fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                                  fontSize: '13px',
                                  lineHeight: '1.6',
                                  color: isDarkMode ? '#c9d1d9' : '#24292f',
                                  background: isDarkMode ? '#0d1117' : '#f6f8fa',
                                  padding: '12px',
                                  borderRadius: '6px',
                                  border: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
                                }}>
                                  {msg.content}
                                </pre>
                              )}

                              {msg.taskId && msg.type !== 'report' && (
                                <div style={{ 
                                  marginTop: '16px', 
                                  paddingTop: '12px', 
                                  borderTop: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8' 
                                }}>
                                  <Text type="secondary" style={{ marginRight: '12px' }}>
                                    运行结果文件：
                                  </Text>
                                  <Space wrap>
                                    <Button 
                                      size="small" 
                                      type="primary"
                                      ghost
                                      icon={<DownloadOutlined />}
                                      onClick={() => window.open(`${API_BASE_URL}/download/${msg.taskId}/csv`, '_blank')}
                                    >
                                      下载 CSV
                                    </Button>
                                    <Button 
                                      size="small" 
                                      type="primary"
                                      ghost
                                      icon={<DownloadOutlined />}
                                      onClick={() => window.open(`${API_BASE_URL}/download/${msg.taskId}/jsonl`, '_blank')}
                                    >
                                      下载 JSONL
                                    </Button>
                                    <Button 
                                      size="small" 
                                      type="primary"
                                      icon={<FileSearchOutlined />}
                                      onClick={() => handleGenerateReport(msg.taskId!)}
                                    >
                                      生成AI分析报告
                                    </Button>
                                  </Space>
                                </div>
                              )}
                            </div>
                          ) : (
                            <pre style={{ 
                              whiteSpace: 'pre-wrap', 
                              wordBreak: 'break-word',
                              margin: 0,
                              fontFamily: 'system-ui, sans-serif',
                              fontSize: '14px',
                              color: isDarkMode ? '#c9d1d9' : '#24292f',
                              background: 'transparent',
                              padding: '0',
                              borderRadius: '0',
                              border: 'none'
                            }}>
                              {msg.content}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  
                  {isLoading && (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '30px',
                      background: isDarkMode ? '#161b22' : '#ffffff',
                      borderRadius: '10px',
                      border: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8',
                      marginBottom: '24px'
                    }}>
                      <Spin size="large" />
                      <div style={{ marginTop: '12px', color: isDarkMode ? '#8b949e' : '#999' }}>
                        分析任务运行中，预计耗时6-10分钟，请耐心等待...
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>
              </Card>
            </div>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default App;