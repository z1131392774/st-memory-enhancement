import { saveSettingsDebounced, } from '../../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../../extensions.js';
import { POPUP_TYPE, Popup, callGenericPopup } from '../../../../popup.js';
import { generateRaw } from '../../../../../../../script.js';
import { Table } from "./source/table.js";
import { TableEditAction } from "./source/tableActions.js";
import { consoleMessageToEditor } from "./derived/devConsole.js";
import {calculateStringHash, generateDeviceId, generateRandomNumber, generateRandomString} from "../utils/utility.js";

/**
 * 默认插件设置
 */
const defaultSettings = {
    // 以下可读写
    injection_mode: 'deep_system',
    deep: 2,
    isExtensionAble: true,
    tableDebugModeAble: false,
    isAiReadTable: true,
    isAiWriteTable: true,
    isTableToChat: false,
    // enableHistory: true,
    step_by_step: false,
    //自动整理表格
    use_main_api: true,
    custom_temperature: 1.0,
    custom_max_tokens: 2048,
    custom_top_p: 1,
    tableBackups: {},
    bool_ignore_del: true,
    ignore_user_sent: false,
    clear_up_stairs:9,
    step_by_step_threshold: 1000,
    sum_multiple_rounds: true,
    unusedChatText: '',
    bool_silent_refresh: false,
    bool_force_refresh: false,
    tableStructure: [
        {
            tableName: "时空表格", tableIndex: 0, columns: ['日期', '时间', '地点（当前描写）', '此地角色'], columnsIndex: [0, 1, 2, 3], enable: true, Required: true, asStatus: true, toChat: true, note: "记录时空信息的表格，应保持在一行",
            initNode: '本轮需要记录当前时间、地点、人物信息，使用insertRow函数', updateNode: "当描写的场景，时间，人物变更时", deleteNode: "此表大于一行时应删除多余行"
        },
        {
            tableName: '角色特征表格', tableIndex: 1, columns: ['角色名', '身体特征', '性格', '职业', '爱好', '喜欢的事物（作品、虚拟人物、物品等）', '住所', '其他重要信息'], enable: true, Required: true, asStatus: true, toChat: true, columnsIndex: [0, 1, 2, 3, 4, 5, 6, 7], note: '角色天生或不易改变的特征csv表格，思考本轮有否有其中的角色，他应作出什么反应',
            initNode: '本轮必须从上文寻找已知的所有角色使用insertRow插入，角色名不能为空', insertNode: '当本轮出现表中没有的新角色时，应插入', updateNode: "当角色的身体出现持久性变化时，例如伤痕/当角色有新的爱好，职业，喜欢的事物时/当角色更换住所时/当角色提到重要信息时", deleteNode: ""
        },
        {
            tableName: '角色与<user>社交表格', tableIndex: 2, columns: ['角色名', '对<user>关系', '对<user>态度', '对<user>好感'], columnsIndex: [0, 1, 2, 3], enable: true, Required: true, asStatus: true, toChat: true, note: '思考如果有角色和<user>互动，应什么态度',
            initNode: '本轮必须从上文寻找已知的所有角色使用insertRow插入，角色名不能为空', insertNode: '当本轮出现表中没有的新角色时，应插入', updateNode: "当角色和<user>的交互不再符合原有的记录时/当角色和<user>的关系改变时", deleteNode: ""
        },
        {
            tableName: '任务、命令或者约定表格', tableIndex: 3, columns: ['角色', '任务', '地点', '持续时间'], columnsIndex: [0, 1, 2, 3], enable: true, Required: false, asStatus: true, toChat: true, note: '思考本轮是否应该执行任务/赴约',
            insertNode: '当特定时间约定一起去做某事时/某角色收到做某事的命令或任务时', updateNode: "", deleteNode: "当大家赴约时/任务或命令完成时/任务，命令或约定被取消时"
        },
        {
            tableName: '重要事件历史表格', tableIndex: 4, columns: ['角色', '事件简述', '日期', '地点', '情绪'], columnsIndex: [0, 1, 2, 3, 4], enable: true, Required: true, asStatus: true, toChat: true, note: '记录<user>或角色经历的重要事件',
            initNode: '本轮必须从上文寻找可以插入的事件并使用insertRow插入', insertNode: '当某个角色经历让自己印象深刻的事件时，比如表白、分手等', updateNode: "", deleteNode: ""
        },
        {
            tableName: '重要物品表格', tableIndex: 5, columns: ['拥有人', '物品描述', '物品名', '重要原因'], columnsIndex: [0, 1, 2, 3], enable: true, Required: false, asStatus: true, toChat: true, note: '对某人很贵重或有特殊纪念意义的物品',
            insertNode: '当某人获得了贵重或有特殊意义的物品时/当某个已有物品有了特殊意义时', updateNode: "", deleteNode: ""
        },
    ],
    to_chat_container: `<div class="table-preview-bar"><details> <summary>记忆增强表格</summary>
$0
</details></div>

<style>
.table-preview-bar {
    padding: 0 8px;
    border-radius: 10px;
    color: #888;
    font-size: 0.8rem;
}
</style>`,
    message_template: `# dataTable 说明
## 用途
- dataTable是 CSV 格式表格，存储数据和状态，是你生成下文的重要参考。
- 新生成的下文应基于 dataTable 发展，并允许更新表格。
## 数据与格式
- 你可以在这里查看所有的表格数据，相关说明和修改表格的触发条件。
- 命名格式：
    - 表名: [tableIndex:表名] (示例: [2:角色特征表格])
    - 列名: [colIndex:列名] (示例: [2:示例列])
    - 行名: [rowIndex]

{{tableData}}

# 增删改dataTable操作方法：
-当你生成正文后，需要根据【增删改触发条件】对每个表格是否需要增删改进行检视。如需修改，请在<tableEdit>标签中使用 JavaScript 函数的写法调用函数，并使用下面的 OperateRule 进行。

## 操作规则 (必须严格遵守)
<OperateRule>
-在某个表格中插入新行时，使用insertRow函数：
insertRow(tableIndex:number, data:{[colIndex:number]:string|number})
例如：insertRow(0, {0: "2021-09-01", 1: "12:00", 2: "阳台", 3: "小花"})
-在某个表格中删除行时，使用deleteRow函数：
deleteRow(tableIndex:number, rowIndex:number)
例如：deleteRow(0, 0)
-在某个表格中更新行时，使用updateRow函数：
updateRow(tableIndex:number, rowIndex:number, data:{[colIndex:number]:string|number})
例如：updateRow(0, 0, {3: "惠惠"})
</OperateRule>

# 重要操作原则 (必须遵守)
-当<user>要求修改表格时，<user>的要求优先级最高。
-每次回复都必须根据剧情在正确的位置进行增、删、改操作，禁止捏造信息和填入未知。
-使用 insertRow 函数插入行时，请为所有已知的列提供对应的数据。且检查data:{[colIndex:number]:string|number}参数是否包含所有的colIndex。
-单元格中禁止使用逗号，语义分割应使用 / 。
-string中，禁止出现双引号。
-社交表格(tableIndex: 2)中禁止出现对<user>的态度。反例 (禁止)：insertRow(2, {"0":"<user>","1":"未知","2":"无","3":"低"})
-<tableEdit>标签内必须使用<!-- -->标记进行注释

# 输出示例：
<tableEdit>
<!--
insertRow(0, {"0":"十月","1":"冬天/下雪","2":"学校","3":"<user>/悠悠"})
deleteRow(1, 2)
insertRow(1, {0:"悠悠", 1:"体重60kg/黑色长发", 2:"开朗活泼", 3:"学生", 4:"羽毛球", 5:"鬼灭之刃", 6:"宿舍", 7:"运动部部长"})
insertRow(1, {0:"<user>", 1:"制服/短发", 2:"忧郁", 3:"学生", 4:"唱歌", 5:"咒术回战", 6:"自己家", 7:"学生会长"})
insertRow(2, {0:"悠悠", 1:"同学", 2:"依赖/喜欢", 3:"高"})
updateRow(4, 1, {0: "小花", 1: "破坏表白失败", 2: "10月", 3: "学校",4:"愤怒"})
insertRow(4, {0: "<user>/悠悠", 1: "悠悠向<user>表白", 2: "2021-10-05", 3: "教室",4:"感动"})
insertRow(5, {"0":"<user>","1":"社团赛奖品","2":"奖杯","3":"比赛第一名"})
-->
</tableEdit>
`,
    refresh_system_message_template: `你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
    refresh_user_message_template: `根据以下规则整理表格：
<整理规则>
    1. 修正格式错误，删除所有data[0]为空的行，此操作只允许整行操作！
    2. 补全空白/未知内容，但禁止捏造信息
    3. 当"重要事件历史表格"(tableIndex: 4)超过10行时，检查是否有重复或内容相近的行，适当合并或删除多余的行，此操作只允许整行操作！
    4. "角色与User社交表格"(tableIndex: 2)中角色名禁止重复，有重复的需要整行删除，此操作只允许整行操作！
    5. "时空表格"(tableIndex: 0）只允许有一行，删除所有旧的内容，此操作只允许整行操作！
    6. 如果一个格子中超过15个字，则进行简化使之不超过15个字；如果一个格子中斜杠分隔的内容超过4个，则简化后只保留不超过4个
    7. 时间格式统一为YYYY-MM-DD HH：MM   (时间中的冒号应当用中文冒号，未知的部分可以省略，例如：2023-10-01 12：00 或 2023-10-01 或 12：00)
    8. 地点格式为 大陆>国家>城市>具体地点 (未知的部分可以省略，例如：大陆>中国>北京>故宫 或 异世界>酒馆)
    9. 单元格中禁止使用逗号，语义分割应使用 /
    10. 单元格内的string中禁止出现双引号
    11. 禁止插入与现有表格内容完全相同的行，检查现有表格数据后再决定是否插入
</整理规则>

<聊天记录>
    $1
</聊天记录>

<当前表格>
    $0
</当前表格>

请用纯JSON格式回复操作列表，确保：
    1. 所有键名必须使用双引号包裹，例如 "action" 而非 action
    2. 数值键名必须加双引号，例如 "0" 而非 0
    3. 使用双引号而非单引号，例如 "value" 而非 'value'
    4. 斜杠（/）必须转义为 \/
    5. 不要包含注释或多余的Markdown标记
    6. 将所有删除操作放在最后发送，并且删除的时候先发送row值较大的操作
    7. 有效的格式：
        [{
            "action": "insert/update/delete",
            "tableIndex": 数字,
            "rowIndex": 数字（delete/update时需要）,
            "data": {列索引: "值"}（insert/update时需要）
        }]
    8. 强调：delete操作不包含"data"，insert操作不包含"rowIndex"
    9. 强调：tableIndex和rowIndex的值为数字，不加双引号，例如 0 而非 "0"

<正确回复示例>
    [
        {
            "action": "update",
            "tableIndex": 0,
            "rowIndex": 0,
            "data": {
            "0": "2023-10-01",
            "1": "12：00",
            "2": "大陆>中国>北京>故宫"
            }
        }，
        {
            "action": "insert",",
            "tableIndex": 0,
            "data": {
            "0": "2023-10-01",
            "1": "12：00",
            "2": "大陆>中国>北京>故宫"
            }
        },
        {
            "action": "delete",
            "tableIndex": 0,
            "rowIndex": 0,
        }
    ]
</正确格式示例>`,
rebuild_system_message_template: `你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
rebuild_user_message_template: `请你根据<整理规则>和<聊天记录>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：
<聊天记录>
    $1
</聊天记录>

<当前表格>
    $0
</当前表格>

<整理规则>
{
  "TableProcessingProtocol": {
    "languageDirective": {
      "processingRules": "en-US",
      "outputSpecification": "zh-CN"
    },
    "structuralIntegrity": {
      "tableIndexPolicy": {
        "creation": "PROHIBITED",
        "modification": "PROHIBITED",
        "deletion": "PROHIBITED"
      },
      "columnManagement": {
        "freezeSchema": true,
        "allowedOperations": ["valueInsertion", "contentOptimization"]
      }
    },
    "processingWorkflow": ["SUPPLEMENT", "SIMPLIFY", "CORRECT", "SUMMARY"],

    "SUPPLEMENT": {
      "insertionProtocol": {
        "characterRegistration": {
          "triggerCondition": "newCharacterDetection || traitMutation",
          "attributeCapture": {
            "scope": "explicitDescriptionsOnly",
            "protectedDescriptors": ["粗布衣裳", "布条束发"],
            "mandatoryFields": ["角色名", "身体特征", "其他重要信息"],
            "validationRules": {
              "physique_description": "MUST_CONTAIN [体型/肤色/发色/瞳色]",
              "relationship_tier": "VALUE_RANGE:[-100, 100]"
            }
          }
        },
        "eventCapture": {
          "thresholdConditions": ["plotCriticality≥3", "emotionalShift≥2"],
          "emergencyBreakCondition": "3_consecutiveSimilarEvents"
        },
        "itemRegistration": {
          "significanceThreshold": "symbolicImportance≥5"
        }
      },
      "dataEnrichment": {
        "dynamicControl": {
          "costumeDescription": {
            "detailedModeThreshold": 25,
            "overflowAction": "SIMPLIFY_TRIGGER"
          },
          "eventDrivenUpdates": {
            "checkInterval": "EVERY_50_EVENTS",
            "monitoringDimensions": [
              "TIME_CONTRADICTIONS",
              "LOCATION_CONSISTENCY",
              "ITEM_TIMELINE",
              "CLOTHING_CHANGES"
            ],
            "updateStrategy": {
              "primaryMethod": "APPEND_WITH_MARKERS",
              "conflictResolution": "PRIORITIZE_CHRONOLOGICAL_ORDER"
            }
          },
          "formatCompatibility": {
            "timeFormatHandling": "ORIGINAL_PRESERVED_WITH_UTC_CONVERSION",
            "locationFormatStandard": "HIERARCHY_SEPARATOR(>)_WITH_GEOCODE",
            "errorCorrectionProtocols": {
              "dateOverflow": "AUTO_ADJUST_WITH_HISTORIC_PRESERVATION",
              "spatialConflict": "FLAG_AND_REMOVE_WITH_BACKUP"
            }
          }
        },
        "traitProtection": {
          "keyFeatures": ["heterochromia", "scarPatterns"],
          "lockCondition": "keywordMatch≥2"
        }
      }
    },

    "SIMPLIFY": {
      "compressionLogic": {
        "characterDescriptors": {
          "activationCondition": "wordCount>25 PerCell && !protectedStatus",
          "optimizationStrategy": {
            "baseRule": "material + color + style",
            "prohibitedElements": ["stitchingDetails", "wearMethod"],
            "mergeExamples": ["深褐/浅褐眼睛 → 褐色眼睛"]
          }
        },
        "eventConsolidation": {
          "mergeDepth": 2,
          "mergeRestrictions": ["crossCharacter", "crossTimeline"],
          "keepCriterion": "LONGER_DESCRIPTION_WITH_KEY_DETAILS"
        }
      },
      "protectionMechanism": {
        "protectedContent": {
          "summaryMarkers": ["[TIER1]", "[MILESTONE]"],
          "criticalTraits": ["异色瞳", "皇室纹章"]
        }
      }
    },

    "CORRECT": {
      "validationMatrix": {
        "temporalConsistency": {
          "checkFrequency": "every10Events",
          "anomalyResolution": "purgeConflicts"
        },
        "columnValidation": {
          "checkConditions": [
            "NUMERICAL_IN_TEXT_COLUMN",
            "TEXT_IN_NUMERICAL_COLUMN",
            "MISPLACED_FEATURE_DESCRIPTION",
            "WRONG_TABLE_PLACEMENT"
          ],
          "correctionProtocol": {
            "autoRelocation": "MOVE_TO_CORRECT_COLUMN",
            "typeMismatchHandling": {
              "primaryAction": "CONVERT_OR_RELOCATE",
              "fallbackAction": "FLAG_AND_ISOLATE"
            },
            "preserveOriginalState": false
          }
        },
        "duplicationControl": {
          "characterWhitelist": ["Physical Characteristics", "Clothing Details"],
          "mergeProtocol": {
            "exactMatch": "purgeRedundant",
            "sceneConsistency": "actionChaining"
          }
        },
        "exceptionHandlers": {
          "invalidRelationshipTier": {
            "operation": "FORCE_NUMERICAL_WITH_LOGGING",
            "loggingDetails": {
              "originalData": "Record the original invalid relationship tier data",
              "conversionStepsAndResults": "The operation steps and results of forced conversion to numerical values",
              "timestamp": "Operation timestamp",
              "tableAndRowInfo": "Names of relevant tables and indexes of relevant data rows"
            }
          },
          "physiqueInfoConflict": {
            "operation": "TRANSFER_TO_other_info_WITH_MARKER",
            "markerDetails": {
              "conflictCause": "Mark the specific cause of the conflict",
              "originalPhysiqueInfo": "Original physique information content",
              "transferTimestamp": "Transfer operation timestamp"
            }
          }
        }
      }
    },

    "SUMMARY": {
      "hierarchicalSystem": {
        "primaryCompression": {
          "triggerCondition": "10_rawEvents && unlockStatus",
          "generationTemplate": "[角色]在[时间段]通过[动作链]展现[特征]",
          "outputConstraints": {
            "maxLength": 200,
            "lockAfterGeneration": true,
            "placement": "重要事件历史表格",
            "columns": {
              "角色": "相关角色",
              "事件简述": "总结内容",
              "日期": "相关日期",
              "地点": "相关地点",
              "情绪": "相关情绪"
            }
          }
        },
        "advancedSynthesis": {
          "triggerCondition": "3_primarySummaries",
          "synthesisFocus": ["growthArc", "worldRulesManifestation"],
          "outputConstraints": {
            "placement": "重要事件历史表格",
            "columns": {
              "角色": "相关角色",
              "事件简述": "总结内容",
              "日期": "相关日期",
              "地点": "相关地点",
              "情绪": "相关情绪"
            }
          }
        }
      },
      "safetyOverrides": {
        "overcompensationGuard": {
          "detectionCriteria": "compressionArtifacts≥3",
          "recoveryProtocol": "rollback5Events"
        }
      }
    },

    "SystemSafeguards": {
      "priorityChannel": {
        "coreProcesses": ["deduplication", "traitPreservation"],
        "loadBalancing": {
          "timeoutThreshold": 15,
          "degradationProtocol": "basicValidationOnly"
        }
      },
      "paradoxResolution": {
        "temporalAnomalies": {
          "resolutionFlow": "freezeAndHighlight",
          "humanInterventionTag": "⚠️REQUIRES_ADMIN"
        }
      },
      "intelligentCleanupEngine": {
        "mandatoryPurgeRules": [
          "EXACT_DUPLICATES_WITH_TIMESTAMP_CHECK",
          "USER_ENTRIES_IN_SOCIAL_TABLE",
          "TIMELINE_VIOLATIONS_WITH_CASCADE_DELETION",
          "EMPTY_ROWS(excluding spacetime)",
          "EXPIRED_QUESTS(>20d)_WITH_ARCHIVAL"
        ],
        "protectionOverrides": {
          "protectedMarkers": ["[TIER1]", "[MILESTONE]"],
          "exemptionConditions": [
            "HAS_PROTECTED_TRAITS",
            "CRITICAL_PLOT_POINT"
          ]
        },
        "cleanupTriggers": {
          "eventCountThreshold": 1000,
          "storageUtilizationThreshold": "85%"
        }
      }
    }
  }
}

回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：
<新的表格>
[{"tableName":"时空表格","tableIndex":0,"columns":["日期","时间","地点（当前描写）","此地角色"],"content":[["2024-01-01","12:00","异世界>酒馆","年轻女子"]]},{"tableName":"角色特征表格","tableIndex":1,"columns":["角色名","身体特征","性格","职业","爱好","喜欢的事物（作品、虚拟人物、物品等）","住所","其他重要信息"],"content":[["年轻女子","身形高挑/小麦色肌肤/乌黑长发/锐利眼睛","野性/不羁/豪爽/好奇","战士","习武","未知","未知","腰悬弯刀/兽牙项链/手指带血"]]},{"tableName":"角色与<user>社交表格","tableIndex":2,"columns":["角色名","对<user>关系","对<user>态度","对<user>好感"],"content":[["年轻女子","陌生人","疑惑/好奇","低"]]},{"tableName":"任务、命令或者约定表格","tableIndex":3,"columns":["角色","任务","地点","持续时间"],"content":[]},{"tableName":"重要事件历史表格","tableIndex":4,"columns":["角色","事件简述","日期","地点","情绪"],"content":[["年轻女子","进入酒馆/点酒/观察<user>","2024-01-01 12:00","异世界>酒馆","好奇"]]},{"tableName":"重要物品表格","tableIndex":5,"columns":["拥有人","物品描述","物品名","重要原因"],"content":[]}]
</新的表格>
`
};

let derivedData = {}
/**
 * @description 辅助函数，递归创建 Proxy
 * @param {Object} obj - 要代理的对象
 * @returns {Object} - 创建的 Proxy 对象
 */
const createProxy = (obj) => {
    return new Proxy(obj, {
        get(target, prop) {
            if (typeof target[prop] === 'object' && target[prop] !== null) {
                return createProxy(target[prop]); // 递归调用 createProxy
            } else {
                return target[prop];
            }
        },
        set(target, prop, newValue) {
            target[prop] = newValue; // 直接修改原始的 props 对象
            return true;
        },
    });
}

/**
 * @description `DerivedData` 项目派生数据管理器
 * @description 该管理器用于管理项目派生数据，包括项目配置信息、用户构建的项目内容等
 * @description 请注意，该管理器仅用于编辑器内部，为防止数据混乱，派生数据不应该直接暴露给用户，而应该通过 `Editor` 编辑器控制器提供的方法进行访问
 * @description 用户直接访问派生数据可能会导致数据不一致，因为编辑器内部可能会对数据进行缓存、计算等操作
 * @description 用户通过 `Editor` 的任何操作应尽量通过提供事件的方式返回并自动执行对派生数据的修改，以保证数据的一致性和该环境中定义的数据单向流动的结构
 * */
export let DERIVED = {
    get any() {
        let data = derivedData;
        if (!data) {
            console.warn("data (props) is undefined, please ensure 'let props = {}' is defined in the same file.");
            return {};
        }
        return createProxy(data);
    },
    Table: Table,
    TableEditAction: TableEditAction,
};

/**
 * @description `Editor` 编辑器控制器
 * @description 该控制器用于管理编辑器的状态、事件、设置等数据，包括鼠标位置、聚焦面板、悬停面板、活动面板等
 * @description 编辑器自身数据相对于其他数据相互独立，对于修改编辑器自身数据不会影响派生数据和用户数据，反之亦然
 * @description 提供给用户的用户原始数据（资产）的编辑操作请通过 `FocusedFile` 控制器提供的方法进行访问和修改
 * */
export let EDITOR = {
    Popup: Popup,
    callGenericPopup: callGenericPopup,
    POPUP_TYPE: POPUP_TYPE,
    generateRaw: generateRaw,
    saveSettingsDebounced: saveSettingsDebounced,

    info: consoleMessageToEditor.info,
    success: consoleMessageToEditor.success,
    warning: consoleMessageToEditor.warning,
    error: consoleMessageToEditor.error,
    clear: consoleMessageToEditor.clear,

    defaultSettings: defaultSettings,
    // data: extension_settings.muyoo_dataTable,
    /**
     * @description 优化的 data 属性，优先从 extension_settings.muyoo_dataTable 获取，
     *              如果不存在则从 defaultSettings 中获取
     */
    data: new Proxy({}, {
        get(_, property) {
            // 优先从 extension_settings.muyoo_dataTable 中获取
            if (extension_settings.muyoo_dataTable && property in extension_settings.muyoo_dataTable) {
                EDITOR.saveSettingsDebounced();
                return extension_settings.muyoo_dataTable[property];
            }
            // 如果 extension_settings.muyoo_dataTable 中不存在，则从 defaultSettings 中获取
            if (defaultSettings && property in defaultSettings) {
                console.log(`变量 ${property} 未找到, 已从默认设置中获取`)
                EDITOR.saveSettingsDebounced();
                return defaultSettings[property];
            }
            // 如果 defaultSettings 中也不存在，则返回 undefined
            consoleMessageToEditor.error(`变量 ${property} 未在默认设置中找到, 请检查代码`)
            EDITOR.saveSettingsDebounced();
            return undefined;
        },
        set(_, property, value) {
            // 将设置操作直接作用于 extension_settings.muyoo_dataTable
            if (!extension_settings.muyoo_dataTable) {
                extension_settings.muyoo_dataTable = {}; // 初始化，如果不存在
            }
            extension_settings.muyoo_dataTable[property] = value;
            // console.log(`设置变量 ${property} 为 ${value}`)
            EDITOR.saveSettingsDebounced();
            return true;
        }
    }),
    IMPORTANT_USER_PRIVACY_DATA: extension_settings.IMPORTANT_USER_PRIVACY_DATA,

    getContext: getContext,
}

let antiShakeTimers = {};
/**
 * @description `SYSTEM` 系统控制器 - 用于管理系统的数据，如文件读写、任务计时等
 */
export let SYSTEM = {
    getComponent: (name) => {
        console.log('getComponent', name);
        return renderExtensionTemplateAsync('third-party/st-memory-enhancement/assets/templates', name);
    },
    /**
     * 防抖函数，控制某个操作的执行频率
     * @param {string} uid 唯一标识符，用于区分不同的防抖操作
     * @param {number} interval 时间间隔，单位毫秒，在这个间隔内只允许执行一次
     * @returns {boolean} 如果允许执行返回 true，否则返回 false
     */
    lazy: function(uid, interval = 100) {
        if (!antiShakeTimers[uid]) {
            antiShakeTimers[uid] = { lastExecutionTime: 0 };
        }
        const timer = antiShakeTimers[uid];
        const currentTime = Date.now();

        if (currentTime - timer.lastExecutionTime < interval) {
            return false; // 时间间隔太短，防抖，不允许执行
        }

        timer.lastExecutionTime = currentTime;
        return true; // 允许执行
    },
    generateRandomString: generateRandomString,
    generateRandomNumber: generateRandomNumber,
    calculateStringHash: calculateStringHash,
    // readFile: ,
    // writeFile: ,
    //
    // taskTiming: ,
};
