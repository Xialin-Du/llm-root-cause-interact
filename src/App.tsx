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
  theme
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
  FileSearchOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { Header, Content, Footer } = Layout;
const { TextArea } = Input;
const { Title, Paragraph, Text } = Typography;

// 后端API配置
const API_BASE_URL = 'http://localhost:8000/api';

// 消息类型定义
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  taskId?: string;
  type?: 'log' | 'report'; // 区分运行日志和分析报告
}

// 上传文件类型定义
interface UploadedFile {
  name: string;
  size: number;
  content: string;
  rawFile: File;
}

const App: React.FC = () => {
  const [inputText, setInputText] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // 两个独立的文件状态
  const [alarmFile, setAlarmFile] = useState<UploadedFile | null>(null);
  const [workorderFile, setWorkorderFile] = useState<UploadedFile | null>(null);
  
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') !== 'light';
  });
  
  // 两个文件选择器ref
  const alarmFileRef = useRef<HTMLInputElement>(null);
  const workorderFileRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // 通用文件读取处理
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

  // 告警文件选择
  const handleAlarmFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    readFile(files[0], (result) => setAlarmFile(result));
    e.target.value = '';
  };

  // 工单文件选择
  const handleWorkorderFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    readFile(files[0], (result) => setWorkorderFile(result));
    e.target.value = '';
  };

  // 删除告警文件
  const deleteAlarmFile = () => {
    setAlarmFile(null);
    message.info('告警文件已删除');
  };

  // 删除工单文件
  const deleteWorkorderFile = () => {
    setWorkorderFile(null);
    message.info('工单文件已删除');
  };

  const sendToLLM = async (displayContent: string) => {
    setIsLoading(true);
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: displayContent,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    const currentAlarm = alarmFile;
    const currentWorkorder = workorderFile;
    setAlarmFile(null);
    setWorkorderFile(null);
    
    const assistantMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
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

      const response = await fetch(`${API_BASE_URL}/llm/analyze`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(900000) // 15分钟超时
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
        
        if (chunk.includes('__TASK_DONE__:')) {
          const [contentPart, taskPart] = chunk.split('__TASK_DONE__:');
          
          if (contentPart) {
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: msg.content + contentPart }
                : msg
            ));
          }
          
          const taskId = taskPart.trim();
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, taskId }
              : msg
          ));
        } else {
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: msg.content + chunk }
              : msg
          ));
        }
      }
    } catch (error) {
      console.error('API调用失败:', error);
      message.error('调用分析服务失败，请检查后端服务是否正常运行');
      
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, content: '**错误：** 无法连接到后端服务，请检查网络连接或后端服务状态。' }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  // 新增：生成大模型分析报告
  const handleGenerateReport = async (taskId: string) => {
    const reportMessageId = Date.now().toString();
    setMessages(prev => [...prev, {
      id: reportMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      type: 'report'
    }]);

    try {
      const formData = new FormData();
      formData.append('task_id', taskId);

      const response = await fetch(`${API_BASE_URL}/llm/generate-report`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(180000) // 3分钟超时
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
        setMessages(prev => prev.map(msg => 
          msg.id === reportMessageId 
            ? { ...msg, content: msg.content + chunk }
            : msg
        ));
      }
    } catch (error) {
      console.error('生成报告失败:', error);
      message.error('生成分析报告失败，请检查大模型配置');
      
      setMessages(prev => prev.map(msg => 
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
    
    // 构造用户侧显示内容
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

  const handleClearHistory = () => {
    setMessages([]);
    message.info('对话历史已清空');
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
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: isDarkMode 
            ? '0 1px 0 rgba(255, 255, 255, 0.08)' 
            : '0 1px 2px rgba(0, 0, 0, 0.05)',
          borderBottom: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
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
        
        <Content style={{ padding: '24px 32px' }}>
          <div style={{ 
            maxWidth: '1600px', 
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1.2fr',
            gap: '24px',
            height: 'calc(100vh - 136px)'
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
                {/* 双文件上传按钮区 */}
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

                {/* 已上传文件信息 */}
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
                      label: '补充说明（可选）',
                      children: (
                        <TextArea
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="可输入补充说明或备注信息，脚本独立运行时可留空..."
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
                  {isLoading ? '分析任务运行中...' : '开始根因分析'}
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
                  onClick={handleClearHistory}
                  disabled={messages.length === 0 || isLoading}
                  size="small"
                >
                  清空历史
                </Button>
              }
            >
              <div style={{ 
                flex: 1, 
                overflowY: 'auto',
                padding: '0 8px',
                scrollBehavior: 'smooth'
              }}>
                {messages.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '120px 0',
                    color: isDarkMode ? '#8b949e' : '#999'
                  }}>
                    <CloudServerOutlined style={{ fontSize: '64px', marginBottom: '20px', opacity: 0.2 }} />
                    <Title level={4} style={{ color: isDarkMode ? '#8b949e' : '#999', marginBottom: '12px' }}>
                      开始根因分析
                    </Title>
                    <Paragraph type="secondary">
                      在左侧上传告警数据和工单数据文件
                    </Paragraph>
                    <Paragraph type="secondary">
                      点击"开始根因分析"按钮获取专业的故障分析报告
                    </Paragraph>
                  </div>
                ) : (
                  messages.map((msg) => (
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
                          {msg.timestamp.toLocaleTimeString()}
                        </Text>
                      </div>
                      
                      <div style={{ 
                        padding: '16px',
                        lineHeight: '1.7',
                        color: isDarkMode ? '#f0f6fc' : '#1f2329'
                      }}>
                        {msg.role === 'assistant' ? (
                          <div>
                            {/* 报告类型用Markdown渲染，日志用等宽字体 */}
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

                            {/* 仅日志消息且有任务ID时，显示下载+生成报告按钮 */}
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
        
        <Footer style={{ 
          textAlign: 'center', 
          background: isDarkMode ? '#0f1419' : '#f5f7fa',
          color: isDarkMode ? '#8b949e' : '#666',
          padding: '16px 0',
          borderTop: isDarkMode ? '1px solid #30363d' : '1px solid #e8e8e8'
        }}>
          LLM 根因定位与分析系统 ©{new Date().getFullYear()} | 企业级智能运维解决方案
        </Footer>
      </Layout>
    </ConfigProvider>
  );
};

export default App;