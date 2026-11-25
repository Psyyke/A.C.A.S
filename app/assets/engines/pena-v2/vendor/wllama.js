// src/glue/messages.ts
var GLUE_VERSION = 1;
var GLUE_MESSAGE_PROTOTYPES = {
  "erro_evt": {
    "name": "erro_evt",
    "structName": "glue_msg_error",
    "className": "GlueMsgError",
    "fields": [
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      }
    ]
  },
  "load_req": {
    "name": "load_req",
    "structName": "glue_msg_load_req",
    "className": "GlueMsgLoadReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "model_paths",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "mmproj_path",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "n_ctx_auto",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mmap",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mlock",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_gpu_layers",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "token_embd_on_gpu",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_threads",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "model_alias",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "log_level",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "embeddings",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "offload_kqv",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_parallel",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "pooling_type",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "rope_scaling_type",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_base",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_scale",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_ext_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_attn_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_fast",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_slow",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "yarn_orig_ctx",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_k",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_v",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "kv_unified",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "flash_attn",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "swa_full",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ctx_checkpoints",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "checkpoint_min_step",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "chat_template",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "jinja",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "default_template_kwargs_keys",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "default_template_kwargs_vals",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "reasoning",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "image_min_tokens",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "image_max_tokens",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "warmup",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "no_kv_offload",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "mmproj_offload",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "cont_batching",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_keep",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "ctx_shift",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "cache_idle_slots",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_cache_reuse",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "lora_paths",
        "isNullable": true
      },
      {
        "type": "arr_float",
        "name": "lora_scales",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "lora_init_without_apply",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "spec_draft_model",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_ngl",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_n_max",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_n_min",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "spec_draft_p_min",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_threads",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_threads_batch",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "spec_type",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_simple_size_n",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_simple_size_m",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_simple_min_hits",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_mod_n_min",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_mod_n_max",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_ngram_mod_n_match",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "kv_overrides_keys",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "kv_overrides_vals",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "reasoning_budget_tokens",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "reasoning_budget_message",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "reasoning_format",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "skip_chat_parsing",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "prefill_assistant",
        "isNullable": true
      }
    ]
  },
  "load_res": {
    "name": "load_res",
    "structName": "glue_msg_load_res",
    "className": "GlueMsgLoadRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_vocab",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx_train",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_embd",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_layer",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_key",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_val",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_bos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eot",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "list_tokens_eog",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_bos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_eos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_encoder",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_decoder_start",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "media_marker",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_image_input",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_audio_input",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_video_input",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_audio_output",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_chat",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_audio_stream",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_live_asr",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "audio_input_rate",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "audio_output_rate",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "audio_voices",
        "isNullable": false
      }
    ]
  },
  "cmpl_req": {
    "name": "cmpl_req",
    "structName": "glue_msg_completion_req",
    "className": "GlueMsgCompletionReq",
    "fields": [
      {
        "type": "bool",
        "name": "is_chat",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "is_asr",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "cmpl_res": {
    "name": "cmpl_res",
    "structName": "glue_msg_completion_res",
    "className": "GlueMsgCompletionRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "embd_req": {
    "name": "embd_req",
    "structName": "glue_msg_embedding_req",
    "className": "GlueMsgEmbeddingReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "embd_res": {
    "name": "embd_res",
    "structName": "glue_msg_embedding_res",
    "className": "GlueMsgEmbeddingRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "rrnk_req": {
    "name": "rrnk_req",
    "structName": "glue_msg_rerank_req",
    "className": "GlueMsgRerankReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "rrnk_res": {
    "name": "rrnk_res",
    "structName": "glue_msg_rerank_res",
    "className": "GlueMsgRerankRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "sys1_req": {
    "name": "sys1_req",
    "structName": "glue_msg_systemone_req",
    "className": "GlueMsgSystemoneReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "sys1_res": {
    "name": "sys1_res",
    "structName": "glue_msg_systemone_res",
    "className": "GlueMsgSystemoneRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "tts__req": {
    "name": "tts__req",
    "structName": "glue_msg_tts_req",
    "className": "GlueMsgTtsReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "tts__res": {
    "name": "tts__res",
    "structName": "glue_msg_tts_res",
    "className": "GlueMsgTtsRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "rtst_req": {
    "name": "rtst_req",
    "structName": "glue_msg_realtime_start_req",
    "className": "GlueMsgRealtimeStartReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "rtst_res": {
    "name": "rtst_res",
    "structName": "glue_msg_realtime_start_res",
    "className": "GlueMsgRealtimeStartRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "rtsd_req": {
    "name": "rtsd_req",
    "structName": "glue_msg_realtime_send_req",
    "className": "GlueMsgRealtimeSendReq",
    "fields": [
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "rtsd_res": {
    "name": "rtsd_res",
    "structName": "glue_msg_realtime_send_res",
    "className": "GlueMsgRealtimeSendRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "gres_req": {
    "name": "gres_req",
    "structName": "glue_msg_get_result_req",
    "className": "GlueMsgGetResultReq",
    "fields": [
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "gres_res": {
    "name": "gres_res",
    "structName": "glue_msg_get_result_res",
    "className": "GlueMsgGetResultRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_more",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "is_error",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "data_raw",
        "isNullable": false
      }
    ]
  },
  "cncl_req": {
    "name": "cncl_req",
    "structName": "glue_msg_cancel_req",
    "className": "GlueMsgCancelReq",
    "fields": [
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "cncl_res": {
    "name": "cncl_res",
    "structName": "glue_msg_cancel_res",
    "className": "GlueMsgCancelRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "slsv_req": {
    "name": "slsv_req",
    "structName": "glue_msg_slot_save_req",
    "className": "GlueMsgSlotSaveReq",
    "fields": [
      {
        "type": "int",
        "name": "id_slot",
        "isNullable": false
      }
    ]
  },
  "slsv_res": {
    "name": "slsv_res",
    "structName": "glue_msg_slot_save_res",
    "className": "GlueMsgSlotSaveRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_tokens",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "data",
        "isNullable": false
      }
    ]
  },
  "slrs_req": {
    "name": "slrs_req",
    "structName": "glue_msg_slot_restore_req",
    "className": "GlueMsgSlotRestoreReq",
    "fields": [
      {
        "type": "int",
        "name": "id_slot",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "data",
        "isNullable": false
      }
    ]
  },
  "slrs_res": {
    "name": "slrs_res",
    "structName": "glue_msg_slot_restore_res",
    "className": "GlueMsgSlotRestoreRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_tokens",
        "isNullable": false
      }
    ]
  },
  "tbop_req": {
    "name": "tbop_req",
    "structName": "glue_msg_test_backend_ops_req",
    "className": "GlueMsgTestBackendOpsReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "args",
        "isNullable": false
      }
    ]
  },
  "tbop_res": {
    "name": "tbop_res",
    "structName": "glue_msg_test_backend_ops_res",
    "className": "GlueMsgTestBackendOpsRes",
    "fields": [
      {
        "type": "int",
        "name": "retcode",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  }
};

// src/glue/glue.ts
var GLUE_MAGIC = new Uint8Array([71, 76, 85, 69]);
var GLUE_DTYPE_NULL = 0;
var GLUE_DTYPE_BOOL = 1;
var GLUE_DTYPE_INT = 2;
var GLUE_DTYPE_FLOAT = 3;
var GLUE_DTYPE_STRING = 4;
var GLUE_DTYPE_RAW = 5;
var GLUE_DTYPE_ARRAY_BOOL = 6;
var GLUE_DTYPE_ARRAY_INT = 7;
var GLUE_DTYPE_ARRAY_FLOAT = 8;
var GLUE_DTYPE_ARRAY_STRING = 9;
var GLUE_DTYPE_ARRAY_RAW = 10;
var TYPE_MAP = {
  str: GLUE_DTYPE_STRING,
  int: GLUE_DTYPE_INT,
  float: GLUE_DTYPE_FLOAT,
  bool: GLUE_DTYPE_BOOL,
  raw: GLUE_DTYPE_RAW,
  arr_str: GLUE_DTYPE_ARRAY_STRING,
  arr_int: GLUE_DTYPE_ARRAY_INT,
  arr_float: GLUE_DTYPE_ARRAY_FLOAT,
  arr_bool: GLUE_DTYPE_ARRAY_BOOL,
  arr_raw: GLUE_DTYPE_ARRAY_RAW,
  null: GLUE_DTYPE_NULL
};
function glueDeserialize(buf) {
  let offset = 0;
  const view = new DataView(buf.buffer);
  const readUint32 = () => {
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const readInt32 = () => {
    const value = view.getInt32(offset, true);
    offset += 4;
    return value;
  };
  const readFloat = () => {
    const value = view.getFloat32(offset, true);
    offset += 4;
    return value;
  };
  const readBool = () => {
    return readUint32() !== 0;
  };
  const readString = (customLen) => {
    const length = customLen ?? readUint32();
    const value = new TextDecoder().decode(buf.slice(offset, offset + length));
    offset += length;
    return value;
  };
  const readRaw = () => {
    const length = readUint32();
    const value = buf.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const readArray = (readItem) => {
    const length = readUint32();
    const value = new Array(length);
    for (let i = 0; i < length; i++) {
      value[i] = readItem();
    }
    return value;
  };
  const readNull = () => null;
  const readField = (field) => {
    switch (field.type) {
      case "str":
        return readString();
      case "int":
        return readInt32();
      case "float":
        return readFloat();
      case "bool":
        return readBool();
      case "raw":
        return readRaw();
      case "arr_str":
        return readArray(readString);
      case "arr_int":
        return readArray(readInt32);
      case "arr_float":
        return readArray(readFloat);
      case "arr_bool":
        return readArray(readBool);
      case "arr_raw":
        return readArray(readRaw);
      case "null":
        return readNull();
    }
  };
  const magicValid = buf[0] === GLUE_MAGIC[0] && buf[1] === GLUE_MAGIC[1] && buf[2] === GLUE_MAGIC[2] && buf[3] === GLUE_MAGIC[3];
  offset += 4;
  if (!magicValid) {
    throw new Error("Invalid magic number");
  }
  const version = readUint32();
  if (version !== GLUE_VERSION) {
    throw new Error("Invalid version number");
  }
  const name = readString(8);
  const msgProto = GLUE_MESSAGE_PROTOTYPES[name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${name}`);
  }
  const output = { _name: name };
  for (const field of msgProto.fields) {
    const readType = readUint32();
    if (readType === GLUE_DTYPE_NULL) {
      if (!field.isNullable) {
        throw new Error(
          `${name}: Expect field ${field.name} to be non-nullable`
        );
      }
      output[field.name] = null;
      continue;
    }
    if (readType !== TYPE_MAP[field.type]) {
      throw new Error(
        `${name}: Expect field ${field.name} to have type ${field.type}`
      );
    }
    output[field.name] = readField(field);
  }
  return output;
}
function glueSerialize(msg) {
  const msgProto = GLUE_MESSAGE_PROTOTYPES[msg._name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${msg._name}`);
  }
  const bufs = [];
  const writeUint32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeInt32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeFloat = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeBool = (value) => {
    writeUint32(value ? 1 : 0);
  };
  const writeString = (value) => {
    const utf8 = new TextEncoder().encode(value);
    writeUint32(utf8.byteLength);
    bufs.push(utf8);
  };
  const writeRaw = (value) => {
    writeUint32(value.byteLength);
    bufs.push(value);
  };
  const writeArray = (value, writeItem) => {
    writeUint32(value.length);
    for (const item of value) {
      writeItem(item);
    }
  };
  const writeNull = () => {
  };
  bufs.push(GLUE_MAGIC);
  writeUint32(GLUE_VERSION);
  {
    const utf8 = new TextEncoder().encode(msg._name);
    bufs.push(utf8);
  }
  for (const field of msgProto.fields) {
    const val = msg[field.name];
    if (!field.isNullable && (val === null || val === void 0)) {
      throw new Error(
        `${msg._name}: Expect field ${field.name} to be non-nullable`
      );
    }
    if (val === null || val === void 0) {
      writeUint32(GLUE_DTYPE_NULL);
      continue;
    }
    writeUint32(TYPE_MAP[field.type]);
    switch (field.type) {
      case "str":
        writeString(val);
        break;
      case "int":
        writeInt32(val);
        break;
      case "float":
        writeFloat(val);
        break;
      case "bool":
        writeBool(val);
        break;
      case "raw":
        writeRaw(val);
        break;
      case "arr_str":
        writeArray(val, writeString);
        break;
      case "arr_int":
        writeArray(val, writeInt32);
        break;
      case "arr_float":
        writeArray(val, writeFloat);
        break;
      case "arr_bool":
        writeArray(val, writeBool);
        break;
      case "arr_raw":
        writeArray(val, writeRaw);
        break;
      case "null":
        writeNull();
        break;
    }
  }
  const totalLength = bufs.reduce((acc, buf) => acc + buf.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of bufs) {
    output.set(buf, offset);
    offset += buf.byteLength;
  }
  return output;
}

// src/gguf-split.ts
var GGUF_SPLIT_CONFIG = {
  // files of this size or bigger are split
  maxFileSize: 4 * 1024 * 1024 * 1024 - 1,
  // target data size of one shard
  shardSize: 2 * 1024 * 1024 * 1024
};
var GGUF_MAGIC = 1179993927;
var KEY_ALIGNMENT = "general.alignment";
var KEY_SPLIT_NO = "split.no";
var KEY_SPLIT_COUNT = "split.count";
var KEY_SPLIT_TENSORS_COUNT = "split.tensors.count";
var TYPE_SIZE = {
  [0 /* UINT8 */]: 1,
  [1 /* INT8 */]: 1,
  [2 /* UINT16 */]: 2,
  [3 /* INT16 */]: 2,
  [4 /* UINT32 */]: 4,
  [5 /* INT32 */]: 4,
  [6 /* FLOAT32 */]: 4,
  [7 /* BOOL */]: 1,
  [10 /* UINT64 */]: 8,
  [11 /* INT64 */]: 8,
  [12 /* FLOAT64 */]: 8
};
var NeedMoreData = class extends Error {
};
var Reader = class {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  pos = 0;
  view;
  need(n) {
    if (this.pos + n > this.bytes.byteLength) throw new NeedMoreData();
  }
  u32() {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  u16() {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u64() {
    this.need(8);
    const v = Number(this.view.getBigUint64(this.pos, true));
    this.pos += 8;
    return v;
  }
  skip(n) {
    this.need(n);
    this.pos += n;
  }
  str() {
    const len = this.u64();
    this.need(len);
    const s = new TextDecoder().decode(
      this.bytes.subarray(this.pos, this.pos + len)
    );
    this.pos += len;
    return s;
  }
  skipValue(type) {
    if (type === 8 /* STRING */) {
      this.skip(this.u64());
    } else if (type === 9 /* ARRAY */) {
      const itemType = this.u32();
      const n = this.u64();
      if (itemType === 8 /* STRING */ || itemType === 9 /* ARRAY */) {
        for (let i = 0; i < n; i++) this.skipValue(itemType);
      } else {
        this.skip(n * this.typeSize(itemType));
      }
    } else {
      this.skip(this.typeSize(type));
    }
  }
  slice(start) {
    return this.bytes.slice(start, this.pos);
  }
  typeSize(type) {
    const size = TYPE_SIZE[type];
    if (size === void 0) throw new Error(`Unknown GGUF type ${type}`);
    return size;
  }
};
var parseHeader = (bytes) => {
  const r = new Reader(bytes);
  if (r.u32() !== GGUF_MAGIC) throw new Error("Not a GGUF file");
  const version = r.u32();
  if (version < 2) throw new Error(`Unsupported GGUF version ${version}`);
  const nTensors = r.u64();
  const nKv = r.u64();
  const kvs = [];
  let alignment = 32;
  let splitCount = 0;
  for (let i = 0; i < nKv; i++) {
    const start = r.pos;
    const key = r.str();
    const type = r.u32();
    if (key === KEY_ALIGNMENT && type === 4 /* UINT32 */) {
      alignment = r.u32();
    } else if (key === KEY_SPLIT_COUNT && type === 2 /* UINT16 */) {
      splitCount = r.u16();
    } else {
      r.skipValue(type);
    }
    kvs.push({ key, raw: r.slice(start) });
  }
  const tensors = [];
  for (let i = 0; i < nTensors; i++) {
    const start = r.pos;
    r.str();
    const nDims = r.u32();
    r.skip(nDims * 8 + 4);
    const raw = r.slice(start);
    tensors.push({ raw, offset: r.u64() });
  }
  const dataStart = Math.ceil(r.pos / alignment) * alignment;
  return { version, splitCount, kvs, tensors, alignment, dataStart };
};
var readHeader = async (blob) => {
  let size = 8 * 1024 * 1024;
  while (true) {
    size = Math.min(size, blob.size);
    const bytes = new Uint8Array(await blob.slice(0, size).arrayBuffer());
    try {
      return parseHeader(bytes);
    } catch (e) {
      if (!(e instanceof NeedMoreData) || size === blob.size) throw e;
      size *= 4;
    }
  }
};
var Writer = class {
  parts = [];
  length = 0;
  bytes(b) {
    this.parts.push(b);
    this.length += b.byteLength;
  }
  num(n, size, write) {
    const b = new Uint8Array(size);
    write(new DataView(b.buffer));
    this.bytes(b);
  }
  u16(v) {
    this.num(v, 2, (d) => d.setUint16(0, v, true));
  }
  u32(v) {
    this.num(v, 4, (d) => d.setUint32(0, v, true));
  }
  i32(v) {
    this.num(v, 4, (d) => d.setInt32(0, v, true));
  }
  u64(v) {
    this.num(v, 8, (d) => d.setBigUint64(0, BigInt(v), true));
  }
  str(s) {
    const b = new TextEncoder().encode(s);
    this.u64(b.byteLength);
    this.bytes(b);
  }
  // header padded with zeros to the alignment
  finish(alignment) {
    const padded = Math.ceil(this.length / alignment) * alignment;
    const out = new Uint8Array(padded);
    let pos = 0;
    for (const p of this.parts) {
      out.set(p, pos);
      pos += p.byteLength;
    }
    return out;
  }
};
var splitBigGguf = async (blob) => {
  const { maxFileSize, shardSize } = GGUF_SPLIT_CONFIG;
  if (blob.size < maxFileSize) return [blob];
  const header = await readHeader(blob);
  if (header.splitCount > 1) {
    throw new Error(
      "A shard of a split GGUF is bigger than 4GB, please split the model into smaller shards"
    );
  }
  const { tensors, alignment, dataStart } = header;
  const dataSize = blob.size - dataStart;
  const groups = [];
  let groupStart = 0;
  tensors.forEach((t, i) => {
    const end = i + 1 < tensors.length ? tensors[i + 1].offset : dataSize;
    if (end < t.offset || i === 0 && t.offset !== 0) {
      throw new Error("GGUF tensors are not stored in order");
    }
    if (groups.length === 0 || end - groupStart > shardSize) {
      groups.push([]);
      groupStart = t.offset;
    }
    groups[groups.length - 1].push(t);
  });
  const alignmentKv = header.kvs.find((kv) => kv.key === KEY_ALIGNMENT);
  const baseName = (blob.name || "model").replace(/\.gguf$/i, "");
  const pad = (n) => String(n).padStart(5, "0");
  return groups.map((group, k) => {
    const start = group[0].offset;
    const end = k + 1 < groups.length ? groups[k + 1][0].offset : dataSize;
    const kvs = k === 0 ? header.kvs.filter((kv) => !kv.key.startsWith("split.")) : alignmentKv ? [alignmentKv] : [];
    const w = new Writer();
    w.u32(GGUF_MAGIC);
    w.u32(header.version);
    w.u64(group.length);
    w.u64(kvs.length + 3);
    for (const kv of kvs) w.bytes(kv.raw);
    w.str(KEY_SPLIT_NO);
    w.u32(2 /* UINT16 */);
    w.u16(k);
    w.str(KEY_SPLIT_COUNT);
    w.u32(2 /* UINT16 */);
    w.u16(groups.length);
    w.str(KEY_SPLIT_TENSORS_COUNT);
    w.u32(5 /* INT32 */);
    w.i32(tensors.length);
    for (const t of group) {
      w.bytes(t.raw);
      w.u64(t.offset - start);
    }
    const shardHeader = w.finish(alignment);
    const data = blob.slice(dataStart + start, dataStart + end);
    return new File(
      [shardHeader, data],
      `${baseName}-${pad(k + 1)}-of-${pad(groups.length)}.gguf`
    );
  });
};

// src/utils.ts
var textDecoder = new TextDecoder();
var URL_PARTS_REGEX = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
var parseShardNumber = (fnameOrUrl) => {
  const matches = fnameOrUrl.match(URL_PARTS_REGEX);
  if (!matches) {
    return {
      baseURL: fnameOrUrl,
      current: 1,
      total: 1
    };
  } else {
    return {
      baseURL: fnameOrUrl.replace(URL_PARTS_REGEX, ""),
      current: parseInt(matches[1]),
      total: parseInt(matches[2])
    };
  }
};
var sortFileByShard = (blobs) => {
  const isFiles = blobs.every((b) => !!b.name);
  if (isFiles && blobs.length > 1) {
    const files = blobs;
    files.sort((a, b) => {
      const infoA = parseShardNumber(a.name);
      const infoB = parseShardNumber(b.name);
      return infoA.current - infoB.current;
    });
  }
};
var isMmproj = (blob) => hasGgufString(blob, "general.architecture", "clip");
var isLoraAdapter = (blob) => hasGgufString(blob, "general.type", "adapter");
var hasGgufString = async (blob, META_NAME, META_VAL) => {
  const tmp = blob.slice(0, 128 * 1024);
  const header = await tmp.arrayBuffer();
  const buf = new Uint8Array(header);
  const nameBytes = new TextEncoder().encode(META_NAME);
  const valBytes = new TextEncoder().encode(META_VAL);
  let offset = -1;
  outer: for (let i = 0; i <= buf.length - nameBytes.length; i++) {
    for (let j = 0; j < nameBytes.length; j++) {
      if (buf[i + j] !== nameBytes[j]) continue outer;
    }
    offset = i;
    break;
  }
  if (offset === -1) return false;
  // Key bytes are followed by a u32 value type (8 = string), a u64 length and the string bytes.
  const typeAt = offset + nameBytes.length, lenAt = typeAt + 4, valAt = lenAt + 8;
  if (valAt + valBytes.length > buf.length) return false;
  const view = new DataView(header);
  if (view.getUint32(typeAt, true) !== 8) return false;
  const valLen = view.getBigUint64(lenAt, true);
  if (valLen !== BigInt(valBytes.length)) return false;
  for (let i = 0; i < valBytes.length; i++) {
    if (buf[valAt + i] !== valBytes[i]) return false;
  }
  return true;
};
var delay = (ms) => new Promise((r) => setTimeout(r, ms));
var absoluteUrl = (relativePath) => typeof document === "undefined" ? new URL(relativePath, self.location.href).href : new URL(relativePath, document.baseURI).href;
var padDigits = (number, digits) => {
  return Array(Math.max(digits - String(number).length + 1, 0)).join("0") + number;
};
var sumArr = (arr) => arr.reduce((prev, curr) => prev + curr, 0);
var isString = (value) => !!value?.startsWith;
var MMPROJ_FILE_NAME = "mmproj.gguf";
var prepareBlobs = async (blobsInp) => {
  const blobs = [];
  const adapters = [];
  let blobMmproj = null;
  for (const blob of blobsInp) {
    if (await isMmproj(blob)) {
      blobMmproj = blob;
    } else if (await isLoraAdapter(blob)) {
      adapters.push(blob);
    } else {
      blobs.push(blob);
    }
  }
  if (blobs.length === 1) {
    blobs.splice(0, 1, ...await splitBigGguf(blobs[0]));
  }
  sortFileByShard(blobs);
  const result = blobs.map((blob, i) => ({
    blob,
    name: `model-${padDigits(i + 1, 5)}-of-${padDigits(blobs.length, 5)}.gguf`
  }));
  const lora = adapters.map((blob, i) => ({ blob, name: `lora-${padDigits(i + 1, 3)}.gguf` }));
  result.push(...lora);
  if (blobMmproj) {
    result.push({
      blob: blobMmproj,
      name: MMPROJ_FILE_NAME
    });
  }
  return {
    lora,
    llm: result.filter((f) => f.name !== MMPROJ_FILE_NAME && !lora.includes(f)),
    mmproj: blobMmproj ? { blob: blobMmproj, name: MMPROJ_FILE_NAME } : null,
    all: result
  };
};
var isSupportMultiThread = () => (async (e) => {
  try {
    return "undefined" != typeof MessageChannel && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(e);
  } catch (e2) {
    return false;
  }
})(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    5,
    4,
    1,
    3,
    1,
    1,
    10,
    11,
    1,
    9,
    0,
    65,
    0,
    254,
    16,
    2,
    0,
    26,
    11
  ])
);
var isSupportExceptions = async () => WebAssembly.validate(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    10,
    8,
    1,
    6,
    0,
    6,
    64,
    25,
    11,
    11
  ])
);
var isSupportSIMD = async () => WebAssembly.validate(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    5,
    1,
    96,
    0,
    1,
    123,
    3,
    2,
    1,
    0,
    10,
    10,
    1,
    8,
    0,
    65,
    0,
    253,
    15,
    253,
    98,
    11
  ])
);
var isSupportJSPI = () => {
  return !!WebAssembly.Suspending;
};
var isSupportWebGPU = () => {
  return !!navigator.gpu;
};
var isSupportRelaxedSIMD = () => (
  // (func (result v128) (i8x16.relaxed_swizzle (i8x16.splat (i32.const 0)) (i8x16.splat (i32.const 0))))
  WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      5,
      1,
      96,
      0,
      1,
      123,
      3,
      2,
      1,
      0,
      10,
      15,
      1,
      13,
      0,
      65,
      0,
      253,
      15,
      65,
      0,
      253,
      15,
      253,
      128,
      2,
      11
    ])
  )
);
var checkEnvironmentCompatible = async () => {
  if (!await isSupportExceptions()) {
    throw new Error("WebAssembly runtime does not support exception handling");
  }
  if (!await isSupportSIMD()) {
    throw new Error("WebAssembly runtime does not support SIMD");
  }
};
var isFirefox = () => {
  return !!navigator.userAgent.match(/Firefox\/([0-9\.]+)(?:\s|$)/);
};
var GGUF_FILE_REGEX = /^.*\.gguf(?:\?.*)?$/;
var isValidGgufFile = (path) => {
  return GGUF_FILE_REGEX.test(path);
};
var isSafariMobile = () => {
  return !!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/);
};
var createWorker = (workerCode) => {
  const workerURL = URL.createObjectURL(
    isString(workerCode) ? new Blob([workerCode], { type: "text/javascript" }) : workerCode
  );
  return new Worker(workerURL, { type: "module" });
};
var cbToAsyncIter = (fn) => (...args) => {
  let values = [];
  let resolve;
  let reject;
  values.push(
    new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    })
  );
  fn(...args, (val, done, err) => {
    if (err) {
      reject(err);
      return;
    }
    resolve([val, done]);
    values.push(
      new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      })
    );
  });
  return (async function* () {
    let val;
    for (let i = 0, done = false; !done; i++) {
      [val, done] = await values[i];
      delete values[i];
      if (val !== void 0) yield val;
    }
  })();
};
var canUseAsyncFileRead = (compat) => isSupportJSPI() || compat;
var needCompat = () => !isSupportJSPI() || !isSupportRelaxedSIMD();

// src/workers-code/generated.ts
var LIBLLAMA_VERSION = "b0-e412c6f";
var LLAMA_CPP_WORKER_CODE = "// Start the main llama.cpp\r\nlet wllamaMalloc;\r\nlet wllamaStart;\r\nlet wllamaAction;\r\nlet wllamaExit;\r\nlet wllamaDebug;\r\n\r\nlet Module = null;\r\nlet lastStack = '';\r\nlet isAborted = false;\r\nlet hasMultithread = false;\r\n\r\n//////////////////////////////////////////////////////////////\r\n// UTILS\r\n//////////////////////////////////////////////////////////////\r\n\r\n// send message back to main thread\r\nconst msg = (data, transfer) => postMessage(data, transfer);\r\n\r\n// Convert CPP log into JS log\r\nconst cppLogToJSLog = (line) => {\r\n  const matched = line.match(/@@(DEBUG|INFO|WARN|ERROR)@@(.*)/);\r\n  return !!matched\r\n    ? {\r\n        level: (matched[1] === 'INFO' ? 'debug' : matched[1]).toLowerCase(),\r\n        text: matched[2],\r\n      }\r\n    : { level: 'log', text: line };\r\n};\r\n\r\nconst getHeapU8 = () => {\r\n  const buffer = Module.wasmMemory.buffer;\r\n  return new Uint8Array(buffer);\r\n};\r\n\r\n// Get module config that forwards stdout/err to main thread\r\nconst getWModuleConfig = (_argMainScriptBlob, wasmModule) => {\r\n  var pathConfig = RUN_OPTIONS.pathConfig;\r\n  var pthreadPoolSize = RUN_OPTIONS.nbThread;\r\n  var argMainScriptBlob = _argMainScriptBlob;\r\n\r\n  hasMultithread = pthreadPoolSize > 1;\r\n\r\n  msg({\r\n    verb: 'console.debug',\r\n    args: [\r\n      `Multithread enabled: ${hasMultithread}, pthreadPoolSize: ${pthreadPoolSize}`,\r\n    ],\r\n  });\r\n\r\n  if (!pathConfig['wllama.wasm']) {\r\n    throw new Error('\"wllama.wasm\" is missing in pathConfig');\r\n  }\r\n  return {\r\n    noInitialRun: true,\r\n    // wasm is compiled by main thread; onSuccess needs the module to share it with pthreads\r\n    instantiateWasm: function (imports, onSuccess) {\r\n      WebAssembly.instantiate(wasmModule, imports)\r\n        .then((instance) => onSuccess(instance, wasmModule))\r\n        .catch(handleError);\r\n      return {};\r\n    },\r\n    print: function (text) {\r\n      if (arguments.length > 1)\r\n        text = Array.prototype.slice.call(arguments).join(' ');\r\n      msg({ verb: 'console.log', args: [text] });\r\n    },\r\n    printErr: function (text) {\r\n      if (arguments.length > 1)\r\n        text = Array.prototype.slice.call(arguments).join(' ');\r\n      if (text.startsWith('@@STACK@@')) {\r\n        lastStack = text.slice('@@STACK@@'.length);\r\n        return;\r\n      }\r\n      const logLine = cppLogToJSLog(text);\r\n      msg({ verb: 'console.' + logLine.level, args: [logLine.text] });\r\n    },\r\n    locateFile: function (filename, basePath) {\r\n      const p = pathConfig[filename];\r\n      const truncate = (str) =>\r\n        str.length > 128 ? `${str.substr(0, 128)}...` : str;\r\n      if (filename.match(/wllama\\.worker\\.js/)) {\r\n        msg({\r\n          verb: 'console.error',\r\n          args: [\r\n            '\"wllama.worker.js\" is removed from v2.2.1. Hint: make sure to clear browser\\'s cache.',\r\n          ],\r\n        });\r\n      } else {\r\n        msg({\r\n          verb: 'console.debug',\r\n          args: [`Loading \"${filename}\" from \"${truncate(p)}\"`],\r\n        });\r\n        return p;\r\n      }\r\n    },\r\n    mainScriptUrlOrBlob: hasMultithread\r\n      ? argMainScriptBlob\r\n      : 'throw new Error(\"Multithreading is not enabled\")',\r\n    pthreadPoolSize: hasMultithread ? pthreadPoolSize : 0,\r\n    wasmMemory: hasMultithread ? getWasmMemory() : null,\r\n    onAbort: function (reason) {\r\n      isAborted = true;\r\n      // the reason can be an Error (for example a failed wasm instantiate)\r\n      const message = reason?.message ?? String(reason);\r\n      msg({ verb: 'signal.abort', args: ['abort', message, lastStack, null] });\r\n    },\r\n    onExit: function (code) {\r\n      isAborted = true;\r\n      const callstack = new Error().stack.toString();\r\n      msg({\r\n        verb: 'signal.abort',\r\n        args: ['abort', 'exit(' + code + ')', callstack, null],\r\n      });\r\n    },\r\n  };\r\n};\r\n\r\n// Get the memory to be used by wasm. (Only used in multi-thread mode)\r\n// Because we have a weird OOM issue on iOS, we need to try some values\r\n// See: https://github.com/emscripten-core/emscripten/issues/19144\r\n//      https://github.com/godotengine/godot/issues/70621\r\nconst getWasmMemory = () => {\r\n  let minBytes = 128 * 1024 * 1024;\r\n  let maxBytes = 4096 * 1024 * 1024;\r\n  let stepBytes = 128 * 1024 * 1024;\r\n  while (maxBytes > minBytes) {\r\n    try {\r\n      const wasmMemory = new WebAssembly.Memory({\r\n        initial: minBytes / 65536,\r\n        maximum: maxBytes / 65536,\r\n        shared: true,\r\n      });\r\n      return wasmMemory;\r\n    } catch (e) {\r\n      maxBytes -= stepBytes;\r\n      continue; // retry\r\n    }\r\n  }\r\n  throw new Error('Cannot allocate WebAssembly.Memory');\r\n};\r\n\r\n//////////////////////////////////////////////////////////////\r\n// HEAPFS PATCH\r\n//////////////////////////////////////////////////////////////\r\n\r\n/**\r\n * By default, emscripten uses memfs. The way it works is by\r\n * allocating new Uint8Array in javascript heap. This is not good\r\n * because it requires files to be copied to wasm heap each time\r\n * a file is read.\r\n *\r\n * HeapFS is an alternative, which resolves this problem by\r\n * allocating space for file directly inside wasm heap. This\r\n * allows us to mmap without doing any copy.\r\n *\r\n * For llama.cpp, this is great because we use MAP_SHARED\r\n *\r\n * Ref: https://github.com/ngxson/wllama/pull/39\r\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/src/library_memfs.js\r\n */\r\n\r\nconst fsNameToFile = {}; // map Name => File\r\nconst fsIdToFile = {}; // map ID => File\r\nlet currFileId = 0;\r\n\r\n// Patch and redirect memfs calls to wllama\r\nconst patchHeapFS = () => {\r\n  const m = Module;\r\n  // save functions\r\n  m.MEMFS.stream_ops._read = m.MEMFS.stream_ops.read;\r\n  m.MEMFS.stream_ops._write = m.MEMFS.stream_ops.write;\r\n  m.MEMFS.stream_ops._llseek = m.MEMFS.stream_ops.llseek;\r\n  m.MEMFS.stream_ops._allocate = m.MEMFS.stream_ops.allocate;\r\n  m.MEMFS.stream_ops._mmap = m.MEMFS.stream_ops.mmap;\r\n  m.MEMFS.stream_ops._msync = m.MEMFS.stream_ops.msync;\r\n\r\n  const patchStream = (stream) => {\r\n    const name = stream.node.name;\r\n    if (fsNameToFile[name]) {\r\n      const f = fsNameToFile[name];\r\n      const ptr = Number(f.ptr);\r\n      stream.node.contents = getHeapU8().subarray(ptr, ptr + f.size);\r\n      stream.node.usedBytes = f.size;\r\n    }\r\n  };\r\n\r\n  // replace \"read\" functions\r\n  m.MEMFS.stream_ops.read = function (\r\n    stream,\r\n    buffer,\r\n    offset,\r\n    length,\r\n    position\r\n  ) {\r\n    patchStream(stream);\r\n    return m.MEMFS.stream_ops._read(stream, buffer, offset, length, position);\r\n  };\r\n  m.MEMFS.ops_table.file.stream.read = m.MEMFS.stream_ops.read;\r\n\r\n  // replace \"llseek\" functions\r\n  m.MEMFS.stream_ops.llseek = function (stream, offset, whence) {\r\n    patchStream(stream);\r\n    return m.MEMFS.stream_ops._llseek(stream, offset, whence);\r\n  };\r\n  m.MEMFS.ops_table.file.stream.llseek = m.MEMFS.stream_ops.llseek;\r\n\r\n  // replace \"mmap\" functions\r\n  m.MEMFS.stream_ops.mmap = function (stream, length, position, prot, flags) {\r\n    patchStream(stream);\r\n    const name = stream.node.name;\r\n    if (fsNameToFile[name]) {\r\n      const f = fsNameToFile[name];\r\n      const mmapPtr = f.ptr + position;\r\n      return {\r\n        ptr: mmapPtr,\r\n        allocated: false,\r\n      };\r\n    } else {\r\n      return m.MEMFS.stream_ops._mmap(stream, length, position, prot, flags);\r\n    }\r\n  };\r\n  m.MEMFS.ops_table.file.stream.mmap = m.MEMFS.stream_ops.mmap;\r\n\r\n  // mount FS\r\n  m.FS.mkdir('/models');\r\n  m.FS.mount(m.MEMFS, { root: '.' }, '/models');\r\n};\r\n\r\n// Allocate a new file in wllama heapfs, returns file ID\r\nconst heapfsAlloc = (name, size, allocBuffer) => {\r\n  if (size < 1) {\r\n    throw new Error('File size must be bigger than 0');\r\n  }\r\n  const m = Module;\r\n  // >>> 0: a wasm32 pointer above 2GB arrives as a negative number\r\n  const ptr = allocBuffer ? m.mmapAlloc(size) >>> 0 : 0;\r\n  const file = {\r\n    ptr: ptr,\r\n    size: size,\r\n    id: currFileId++,\r\n  };\r\n  fsIdToFile[file.id] = file;\r\n  fsNameToFile[name] = file;\r\n  return file.id;\r\n};\r\n\r\n// Add new file to wllama heapfs, return number of written bytes\r\nconst heapfsWrite = (id, buffer, offset) => {\r\n  if (fsIdToFile[id]) {\r\n    const { ptr, size } = fsIdToFile[id];\r\n    const afterWriteByte = offset + buffer.byteLength;\r\n    if (afterWriteByte > size) {\r\n      throw new Error(\r\n        `File ID ${id} write out of bound, afterWriteByte = ${afterWriteByte} while size = ${size}`\r\n      );\r\n    }\r\n    getHeapU8().set(buffer, Number(ptr) + offset);\r\n    return buffer.byteLength;\r\n  } else {\r\n    throw new Error(`File ID ${id} not found in heapfs`);\r\n  }\r\n};\r\n\r\n//////////////////////////////////////////////////////////////\r\n// ASYNC FILE READ\r\n//////////////////////////////////////////////////////////////\r\n\r\nlet isAwaitReading = false;\r\nlet pendingReadPromise = null;\r\nlet pendingReadResolve = null;\r\nlet pendingReadReject = null;\r\n\r\nconst _stripModelsPrefix = (path) => path.replace(/^\\/?models\\//, '');\r\n\r\n// postMessage cannot send an ArrayBuffer bigger than 2GB, so big reads are split\r\nconst MAX_READ_CHUNK = 256 * 1024 * 1024;\r\n\r\n// Called from EM_ASYNC_JS stub in cpp/wllama-patch.cpp (path is already a JS string)\r\nconst _wllama_js_file_read = async (path, offset, req_size, out_ptr) => {\r\n  const name = _stripModelsPrefix(path);\r\n  let total = 0;\r\n  while (total < req_size) {\r\n    const size = Math.min(MAX_READ_CHUNK, req_size - total);\r\n    const got = await readFileChunk(\r\n      name,\r\n      offset + total,\r\n      size,\r\n      out_ptr + total\r\n    );\r\n    total += got;\r\n    if (got < size) break; // end of file\r\n  }\r\n  return total;\r\n};\r\n\r\nconst readFileChunk = async (name, offset, req_size, out_ptr) => {\r\n  pendingReadPromise = new Promise((res, rej) => {\r\n    pendingReadResolve = res;\r\n    pendingReadReject = rej;\r\n  });\r\n  isAwaitReading = true;\r\n\r\n  postMessage({ verb: 'fs.read_req', args: [name, offset, req_size] });\r\n\r\n  let data;\r\n  try {\r\n    data = await pendingReadPromise;\r\n  } finally {\r\n    isAwaitReading = false;\r\n    pendingReadPromise = null; // do not keep the read buffer alive\r\n    pendingReadResolve = null;\r\n    pendingReadReject = null;\r\n  }\r\n\r\n  const bytes = new Uint8Array(data);\r\n  getHeapU8().set(bytes, out_ptr);\r\n  return bytes.length;\r\n};\r\n\r\n//////////////////////////////////////////////////////////////\r\n// MAIN CODE\r\n//////////////////////////////////////////////////////////////\r\n\r\nconst callWrapper = (name, ret, args, isAsync) => {\r\n  const fn = Module.cwrap(\r\n    name,\r\n    ret,\r\n    args,\r\n    isAsync ? { async: true } : undefined\r\n  );\r\n  return async (action, req) => {\r\n    // console.log(`Calling ${name} with action:`, action, 'and req:', req);\r\n    let result;\r\n    try {\r\n      if (args.length === 2) {\r\n        result = isAsync ? await fn(action, req) : fn(action, req);\r\n      } else {\r\n        result = fn();\r\n      }\r\n    } catch (ex) {\r\n      console.error(ex);\r\n      throw ex;\r\n    }\r\n    return result;\r\n  };\r\n};\r\n\r\n// re-entering the wasm while a call is suspended (JSPI / asyncify) corrupts its state, so only one call runs at a time and the rest wait in the queue\r\nlet wasmCallBusy = false;\r\nconst wasmCallQueue = [];\r\n\r\nconst runWasmCall = async (callbackId, fn) => {\r\n  if (isAborted) {\r\n    // the wasm is dead, fail fast instead of calling into it\r\n    msg({ callbackId, err: 'wllama has crashed, please reload the module' });\r\n    return;\r\n  }\r\n  if (wasmCallBusy) {\r\n    wasmCallQueue.push({ callbackId, fn });\r\n    return;\r\n  }\r\n  wasmCallBusy = true;\r\n  try {\r\n    await fn();\r\n  } finally {\r\n    wasmCallBusy = false;\r\n    if (isAborted) {\r\n      // do not touch the wasm again after it aborted; the main thread already rejected the queued tasks\r\n      wasmCallQueue.length = 0;\r\n    } else {\r\n      const next = wasmCallQueue.shift();\r\n      if (next) runWasmCall(next.callbackId, next.fn);\r\n    }\r\n  }\r\n};\r\n\r\nconst runAction = async (data) => {\r\n  const { args, callbackId } = data;\r\n  const argAction = args[0];\r\n  const argEncodedMsg = args[1];\r\n  try {\r\n    // >>> 0: a wasm32 pointer above 2GB arrives as a negative number\r\n    const inputPtr = (await wllamaMalloc(argEncodedMsg.byteLength, 0)) >>> 0;\r\n    // copy data to wasm heap\r\n    const inputBuffer = new Uint8Array(\r\n      getHeapU8().buffer,\r\n      Number(inputPtr),\r\n      argEncodedMsg.byteLength\r\n    );\r\n    inputBuffer.set(argEncodedMsg, 0);\r\n    const outputPtr = (await wllamaAction(argAction, inputPtr)) >>> 0;\r\n    if (!Number(outputPtr)) {\r\n      msg({\r\n        callbackId,\r\n        err: `Action \"${argAction}\" failed, see the native log`,\r\n      });\r\n      return;\r\n    }\r\n    // length of output buffer is written at the first 4 bytes of input buffer\r\n    const outputLen = new Uint32Array(\r\n      getHeapU8().buffer,\r\n      Number(inputPtr),\r\n      1\r\n    )[0];\r\n    // copy the output buffer to JS heap\r\n    const outputBuffer = new Uint8Array(outputLen);\r\n    const outputSrcView = new Uint8Array(\r\n      getHeapU8().buffer,\r\n      Number(outputPtr),\r\n      outputLen\r\n    );\r\n    outputBuffer.set(outputSrcView, 0); // copy it\r\n    msg({ callbackId, result: outputBuffer }, [outputBuffer.buffer]);\r\n  } catch (err) {\r\n    handleError(err);\r\n  }\r\n};\r\n\r\nfunction handleError(err) {\r\n  // If WASM already aborted, onAbort already sent signal.abort; skip to avoid\r\n  // re-reporting the resulting WebAssembly.RuntimeError as a JS exception.\r\n  if (isAborted) return;\r\n\r\n  const message = err ? err.message || String(err) : 'Unknown error';\r\n  const stack = err ? err.stack || String(err) : '';\r\n  msg({\r\n    verb: 'signal.abort',\r\n    args: ['exception', message, stack, err],\r\n  });\r\n}\r\n\r\nonmessage = async (e) => {\r\n  if (!e.data) return;\r\n  const { verb, args, callbackId } = e.data;\r\n\r\n  // fs.read_res arrives while wasm is JSPI-suspended; resolve the pending promise.\r\n  if (verb === 'fs.read_res') {\r\n    if (pendingReadResolve) {\r\n      pendingReadResolve(args[0]);\r\n    }\r\n    return;\r\n  }\r\n\r\n  // Guard: while awaiting a file read, reject any other incoming task.\r\n  if (isAwaitReading) {\r\n    if (callbackId) {\r\n      msg({\r\n        callbackId,\r\n        err: 'Worker is suspended waiting for file data (JSPI)',\r\n      });\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (!callbackId) {\r\n    msg({ verb: 'console.error', args: ['callbackId is required', e.data] });\r\n    return;\r\n  }\r\n\r\n  if (verb === 'module.init') {\r\n    const argMainScriptBlob = args[0];\r\n    const argUseAsyncFile = args[1];\r\n    const argWasmModule = args[2];\r\n    try {\r\n      Module = getWModuleConfig(argMainScriptBlob, argWasmModule);\r\n      Module.preRun = () => {\r\n        if (argUseAsyncFile) {\r\n          Module.ENV['USE_ASYNC_FILE'] = '1';\r\n        }\r\n      };\r\n      Module.onRuntimeInitialized = () => {\r\n        // async call once module is ready\r\n        // init FS\r\n        patchHeapFS();\r\n        // init cwrap\r\n        const pointer = 'number';\r\n        // TODO: note sure why emscripten cannot bind if there is only 1 argument\r\n        wllamaMalloc = callWrapper('wllama_malloc', pointer, [\r\n          'number',\r\n          pointer,\r\n        ]);\r\n        wllamaStart = callWrapper('wllama_start', 'string', [], true);\r\n        wllamaAction = callWrapper(\r\n          'wllama_action',\r\n          pointer,\r\n          ['string', pointer],\r\n          true\r\n        );\r\n        wllamaExit = callWrapper('wllama_exit', 'string', []);\r\n        wllamaDebug = callWrapper('wllama_debug', 'string', []);\r\n        msg({ callbackId, result: null });\r\n      };\r\n      wModuleInit();\r\n    } catch (err) {\r\n      handleError(err);\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (verb === 'fs.alloc') {\r\n    const argFilename = args[0];\r\n    const argSize = args[1];\r\n    const argAllocBuffer = args[2];\r\n    try {\r\n      // create blank file\r\n      const emptyBuffer = new ArrayBuffer(0);\r\n      Module['FS_createDataFile'](\r\n        '/models',\r\n        argFilename,\r\n        emptyBuffer,\r\n        true,\r\n        true,\r\n        true\r\n      );\r\n      // alloc data on heap\r\n      const fileId = heapfsAlloc(argFilename, argSize, argAllocBuffer);\r\n      msg({ callbackId, result: { fileId } });\r\n    } catch (err) {\r\n      handleError(err);\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (verb === 'fs.write') {\r\n    const argFileId = args[0];\r\n    const argBuffer = args[1];\r\n    const argOffset = args[2];\r\n    try {\r\n      const writtenBytes = heapfsWrite(argFileId, argBuffer, argOffset);\r\n      msg({ callbackId, result: { writtenBytes } });\r\n    } catch (err) {\r\n      handleError(err);\r\n    }\r\n    return;\r\n  }\r\n\r\n  if (verb === 'wllama.start') {\r\n    await runWasmCall(callbackId, async () => {\r\n      try {\r\n        const result = await wllamaStart();\r\n        msg({ callbackId, result });\r\n      } catch (err) {\r\n        handleError(err);\r\n      }\r\n    });\r\n    return;\r\n  }\r\n\r\n  if (verb === 'wllama.action') {\r\n    await runWasmCall(callbackId, () => runAction(e.data));\r\n    return;\r\n  }\r\n\r\n  if (verb === 'wllama.exit') {\r\n    await runWasmCall(callbackId, async () => {\r\n      try {\r\n        const result = await wllamaExit();\r\n        msg({ callbackId, result });\r\n      } catch (err) {\r\n        handleError(err);\r\n      }\r\n    });\r\n    return;\r\n  }\r\n\r\n  if (verb === 'wllama.debug') {\r\n    await runWasmCall(callbackId, async () => {\r\n      try {\r\n        const result = await wllamaDebug();\r\n        msg({ callbackId, result });\r\n      } catch (err) {\r\n        handleError(err);\r\n      }\r\n    });\r\n    return;\r\n  }\r\n};\r\n";
var OPFS_UTILS_WORKER_CODE = "let accessHandle;\r\nlet fileHandler;\r\nlet writePos = 0;\r\nlet abortController = new AbortController();\r\n\r\n// keep the first `offset` bytes, the next writes go after them\r\nasync function openFile(filename, offset = 0) {\r\n  const opfsRoot = await navigator.storage.getDirectory();\r\n  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });\r\n  fileHandler = await cacheDir.getFileHandle(filename, { create: true });\r\n  accessHandle = await fileHandler.createSyncAccessHandle();\r\n  accessHandle.truncate(offset);\r\n  writePos = offset;\r\n}\r\n\r\nasync function writeFile(buf) {\r\n  try {\r\n    writePos += accessHandle.write(buf, { at: writePos });\r\n  } catch (e) {\r\n    // iOS Safari can close the handle in the middle of a download, open a new one and try once more\r\n    if (e?.name !== 'InvalidStateError') throw e;\r\n    accessHandle = await fileHandler.createSyncAccessHandle();\r\n    writePos += accessHandle.write(buf, { at: writePos });\r\n  }\r\n}\r\n\r\nasync function closeFile() {\r\n  accessHandle.flush();\r\n  accessHandle.close();\r\n}\r\n\r\nasync function writeTextFile(filename, str) {\r\n  await openFile(filename);\r\n  await writeFile(new TextEncoder().encode(str));\r\n  await closeFile();\r\n}\r\n\r\nconst throttled = (func, delay) => {\r\n  let lastRun = 0;\r\n  return (...args) => {\r\n    const now = Date.now();\r\n    if (now - lastRun > delay) {\r\n      lastRun = now;\r\n      func.apply(null, args);\r\n    }\r\n  };\r\n};\r\n\r\nconst assertNonNull = (val) => {\r\n  if (val === null || val === undefined) {\r\n    throw new Error('OPFS Worker: Assertion failed');\r\n  }\r\n};\r\n\r\n// respond to main thread\r\nconst resOK = () => postMessage({ ok: true });\r\nconst resProgress = (loaded, total) =>\r\n  postMessage({ progress: { loaded, total } });\r\nconst resErr = (err) => postMessage({ err });\r\n\r\nonmessage = async (e) => {\r\n  try {\r\n    if (!e.data) return;\r\n\r\n    /**\r\n     * @param {Object} e.data\r\n     *\r\n     * Fine-control FS actions:\r\n     * - { action: 'open', filename: 'string', offset: number }\r\n     * - { action: 'write', buf: ArrayBuffer }\r\n     * - { action: 'close' }\r\n     *\r\n     * Simple write API:\r\n     * - { action: 'write-simple', filename: 'string', buf: ArrayBuffer }\r\n     *\r\n     * Download API:\r\n     * - { action: 'download', url: 'string', filename: 'string', options: Object, metadataFileName: 'string' }\r\n     * - { action: 'download-abort' }\r\n     */\r\n    const {\r\n      action,\r\n      filename,\r\n      buf,\r\n      url,\r\n      options,\r\n      metadataFileName,\r\n      metadataAdditional,\r\n    } = e.data;\r\n\r\n    if (action === 'open') {\r\n      assertNonNull(filename);\r\n      await openFile(filename, e.data.offset ?? 0);\r\n      return resOK();\r\n    } else if (action === 'write') {\r\n      assertNonNull(buf);\r\n      await writeFile(buf);\r\n      return resOK();\r\n    } else if (action === 'close') {\r\n      await closeFile();\r\n      return resOK();\r\n    } else if (action === 'write-simple') {\r\n      assertNonNull(filename);\r\n      assertNonNull(buf);\r\n      await openFile(filename);\r\n      await writeFile(buf);\r\n      await closeFile();\r\n      return resOK();\r\n    } else if (action === 'download') {\r\n      assertNonNull(url);\r\n      assertNonNull(filename);\r\n      assertNonNull(metadataFileName);\r\n      assertNonNull(options);\r\n      assertNonNull(options.aborted);\r\n      abortController = new AbortController();\r\n      if (options.aborted) abortController.abort();\r\n      const response = await fetch(url, {\r\n        ...options,\r\n        signal: abortController.signal,\r\n      });\r\n      const contentLength = response.headers.get('content-length');\r\n      const etag = (response.headers.get('etag') || '').replace(\r\n        /[^A-Za-z0-9]/g,\r\n        ''\r\n      );\r\n      const total = parseInt(contentLength, 10);\r\n      const reader = response.body.getReader();\r\n      await openFile(filename);\r\n      let loaded = 0;\r\n      const throttledProgress = throttled(resProgress, 100);\r\n      while (true) {\r\n        const { done, value } = await reader.read();\r\n        if (done) break;\r\n        loaded += value.byteLength;\r\n        await writeFile(value);\r\n        throttledProgress(loaded, total);\r\n      }\r\n      resProgress(total, total); // 100% done\r\n      await closeFile();\r\n      // make sure this is in-sync with CacheEntryMetadata\r\n      await writeTextFile(\r\n        metadataFileName,\r\n        JSON.stringify({\r\n          originalURL: url,\r\n          originalSize: total,\r\n          etag,\r\n          ...metadataAdditional,\r\n        })\r\n      );\r\n      return resOK();\r\n    } else if (action === 'download-abort') {\r\n      if (abortController) {\r\n        abortController.abort();\r\n      }\r\n      return;\r\n    }\r\n\r\n    throw new Error('OPFS Worker: Invalid action', e.data);\r\n  } catch (err) {\r\n    return resErr(err);\r\n  }\r\n};\r\n";
var WEBGPU_POLL_PATCH_CODE = `// Firefox resolves WebGPU promises (onSubmittedWorkDone, mapAsync) only on a 100 ms timer: https://bugzilla.mozilla.org/show_bug.cgi?id=1870699\r
// A read back of a WebGPU canvas makes Firefox poll the device at once, and the poll also resolves our pending promises.\r
// So after each wait starts, we draw a 1x1 WebGPU canvas into a 2D canvas. See "Patches" in README-dev.md\r
(() => {\r
  if (\r
    typeof GPUAdapter === 'undefined' ||\r
    !/Firefox\\//.test(navigator.userAgent)\r
  ) {\r
    return;\r
  }\r
\r
  let device = null;\r
  let gpuCanvas = null;\r
  let gpuCtx = null;\r
  let ctx2d = null;\r
\r
  const requestDevice = GPUAdapter.prototype.requestDevice;\r
  GPUAdapter.prototype.requestDevice = async function (...args) {\r
    device = await requestDevice.apply(this, args);\r
    return device;\r
  };\r
\r
  const poll = () => {\r
    if (!device) {\r
      return;\r
    }\r
    try {\r
      if (!gpuCanvas) {\r
        gpuCanvas = new OffscreenCanvas(1, 1);\r
        gpuCtx = gpuCanvas.getContext('webgpu');\r
        gpuCtx.configure({\r
          device,\r
          format: navigator.gpu.getPreferredCanvasFormat(),\r
          alphaMode: 'opaque',\r
        });\r
        ctx2d = new OffscreenCanvas(1, 1).getContext('2d');\r
      }\r
      // without new work on the canvas, Firefox gives the last frame and does not poll\r
      const encoder = device.createCommandEncoder();\r
      encoder\r
        .beginRenderPass({\r
          colorAttachments: [\r
            {\r
              view: gpuCtx.getCurrentTexture().createView(),\r
              loadOp: 'clear',\r
              storeOp: 'store',\r
            },\r
          ],\r
        })\r
        .end();\r
      device.queue.submit([encoder.finish()]);\r
      ctx2d.drawImage(gpuCanvas, 0, 0);\r
    } catch (e) {\r
      // stop polling, the waits use the 100 ms timer again\r
      console.warn('wllama: WebGPU poll patch disabled:', e);\r
      device = null;\r
    }\r
  };\r
\r
  const onSubmittedWorkDone = GPUQueue.prototype.onSubmittedWorkDone;\r
  GPUQueue.prototype.onSubmittedWorkDone = function (...args) {\r
    const promise = onSubmittedWorkDone.apply(this, args);\r
    poll();\r
    return promise;\r
  };\r
\r
  const mapAsync = GPUBuffer.prototype.mapAsync;\r
  GPUBuffer.prototype.mapAsync = function (...args) {\r
    const promise = mapAsync.apply(this, args);\r
    poll();\r
    return promise;\r
  };\r
})();\r
`;

// src/worker.ts
var FILE_READ_REQ_EVENT = "fs.read_req";
var WASM_JS_SECTION_NAME = "wllama_js";
var JSPI_STUB = `
if (!WebAssembly.Suspending) {
  // JSPI not available - stubs that keep the import/export tables valid.
  // Suspending wraps imports: identity is fine since async imports won't be called.
  WebAssembly.Suspending = function (fn) {
    // console.log(fn.toString());
    return fn;
  };
  // promising wraps exports: must return a Promise so ccall's ret.then() works.
  WebAssembly.promising = function (fn) {
    return function (...args) {
      try {
        return Promise.resolve(fn(...args));
      } catch (e) {
        return Promise.reject(e);
      }
    };
  };
}
`;
var ProxyToWorker = class {
  resources;
  logger;
  suppressNativeLog;
  taskQueue = [];
  taskId = 1;
  resultQueue = [];
  busy = false;
  // is the work loop is running?
  exited = false;
  exitCtrl = new AbortController();
  // cancel fetches of moduleInit on exit
  worker;
  multiThread;
  nbThread;
  useAsyncFile;
  fileBlobs = /* @__PURE__ */ new Map();
  // filename -> Blob for async reads
  constructor(resources, nbThread, suppressNativeLog, logger) {
    this.resources = resources;
    this.nbThread = nbThread;
    this.multiThread = nbThread > 0;
    this.logger = logger;
    this.suppressNativeLog = suppressNativeLog;
    this.useAsyncFile = canUseAsyncFileRead(resources.compat);
  }
  // the compiled module is sent to the worker, emscripten uses it via Module.instantiateWasm
  async compileWasm() {
    const url = this.resources.wasmPath;
    const fetchWasm = () => fetch(url, { credentials: "same-origin", signal: this.exitCtrl.signal });
    if (typeof WebAssembly.compileStreaming === "function") {
      try {
        return await WebAssembly.compileStreaming(fetchWasm());
      } catch (e) {
        this.throwIfExited();
        this.logger.warn(
          `wasm streaming compile failed: ${e}; falling back to ArrayBuffer instantiation`
        );
      }
    }
    const response = await fetchWasm();
    if (!response.ok) {
      throw new Error(`Failed to fetch wasm from ${url}`);
    }
    return await WebAssembly.compile(await response.arrayBuffer());
  }
  async getModuleCode(wasmModule) {
    let code;
    if (!this.resources.jsPath) {
      return this.getEmbeddedModuleCode(wasmModule);
    } else if (this.resources.jsPath.code) {
      code = this.resources.jsPath.code;
    } else if (isString(this.resources.jsPath)) {
      const response = await fetch(this.resources.jsPath, {
        signal: this.exitCtrl.signal
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch worker code from ${this.resources.jsPath}`
        );
      }
      code = await response.text();
    } else {
      throw new Error("No JS code provided for worker");
    }
    if (!code.includes("var Module")) {
      this.logger.warn(
        'The worker JS has no emscripten code, using the JS embedded in the wasm file. The "worker" option of setCompat() is no longer needed.'
      );
      return this.getEmbeddedModuleCode(wasmModule);
    }
    return code;
  }
  getEmbeddedModuleCode(wasmModule) {
    const sections = WebAssembly.Module.customSections(
      wasmModule,
      WASM_JS_SECTION_NAME
    );
    if (sections.length === 0) {
      throw new Error(
        `The wasm file "${this.resources.wasmPath}" does not contain the JS code ("${WASM_JS_SECTION_NAME}" section). Make sure the wasm file comes from the same version of wllama.`
      );
    }
    return new TextDecoder().decode(sections[0]);
  }
  throwIfExited() {
    if (this.exited) {
      throw new WllamaError("The model was unloaded", "model_not_loaded");
    }
  }
  async moduleInit(ggufFiles) {
    let wasmModule;
    let moduleCode;
    try {
      wasmModule = await this.compileWasm();
      moduleCode = JSPI_STUB + await this.getModuleCode(wasmModule);
    } catch (e) {
      this.throwIfExited();
      throw e;
    }
    this.throwIfExited();
    if (this.resources.noWebGPU) {
      moduleCode = 'try{Object.defineProperty(WorkerNavigator.prototype,"gpu",{get:()=>({requestAdapter:async()=>null})});}catch(e){}' + moduleCode;
    }
    let mainModuleCode = moduleCode.replace("var Module", "var ___Module");
    const runOptions = {
      pathConfig: {
        "wllama.wasm": this.resources.wasmPath
      },
      nbThread: this.nbThread,
      compat: this.resources.compat
    };
    const completeCode = [
      `const RUN_OPTIONS = ${JSON.stringify(runOptions)};`,
      WEBGPU_POLL_PATCH_CODE,
      `function wModuleInit() { ${mainModuleCode}; return Module; }`,
      LLAMA_CPP_WORKER_CODE
    ].join(";\n\n");
    this.worker = createWorker(completeCode);
    this.worker.onmessage = this.onRecvMsg.bind(this);
    this.worker.onerror = this.logger.error;
    const res = await this.pushTask({
      verb: "module.init",
      args: [
        new Blob([moduleCode], { type: "text/javascript" }),
        this.useAsyncFile,
        wasmModule
      ],
      callbackId: this.taskId++
    });
    const nativeFiles = [];
    for (const file of ggufFiles) {
      const needAllocBuffer = !this.useAsyncFile;
      const id = await this.fileAlloc(
        file.name,
        file.blob.size,
        needAllocBuffer
      );
      nativeFiles.push({ id, ...file });
      if (this.useAsyncFile) {
        this.fileBlobs.set(file.name, file.blob);
      }
    }
    if (!this.useAsyncFile) {
      await Promise.all(
        nativeFiles.map((file) => {
          return this.fileWrite(file.id, file.blob);
        })
      );
    }
    return res;
  }
  async wllamaStart() {
    const result = await this.pushTask({
      verb: "wllama.start",
      args: [],
      callbackId: this.taskId++
    });
    const parsedResult = this.parseResult(result);
    return parsedResult;
  }
  async wllamaAction(name, body) {
    const encodedMsg = glueSerialize(body);
    const result = await this.pushTask({
      verb: "wllama.action",
      args: [name, encodedMsg],
      callbackId: this.taskId++
    });
    const parsedResult = glueDeserialize(result);
    if (parsedResult._name === "erro_evt") {
      throw new WllamaError(parsedResult.message, "inference_error");
    }
    return parsedResult;
  }
  async wllamaExit() {
    if (this.worker) {
      this.worker.terminate();
    }
    this.exited = true;
    this.exitCtrl.abort();
    this.rejectAll(
      new WllamaError("The model was unloaded", "model_not_loaded")
    );
  }
  async wllamaDebug() {
    const result = await this.pushTask({
      verb: "wllama.debug",
      args: [],
      callbackId: this.taskId++
    });
    return JSON.parse(result);
  }
  ///////////////////////////////////////
  /**
   * Allocate a new file in heapfs
   * @returns fileId, to be used by fileWrite()
   */
  async fileAlloc(fileName, size, allocBuffer) {
    const result = await this.pushTask({
      verb: "fs.alloc",
      args: [fileName, size, allocBuffer],
      callbackId: this.taskId++
    });
    return result.fileId;
  }
  /**
   * Write a Blob to heapfs
   */
  async fileWrite(fileId, blob) {
    const reader = blob.stream().getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const size = value.byteLength;
      await this.pushTask(
        {
          verb: "fs.write",
          args: [fileId, value, offset],
          callbackId: this.taskId++
        },
        // @ts-ignore Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'
        [value.buffer]
      );
      offset += size;
    }
  }
  async fileReadResponse(name, offset, size) {
    try {
      const blob = this.fileBlobs.get(name);
      if (!blob) {
        throw new Error(`blob not found for name="${name}"`);
      }
      const chunk = blob.slice(offset, offset + size);
      const buffer = await chunk.arrayBuffer();
      this.worker.postMessage(
        { verb: "fs.read_res", args: [buffer] },
        { transfer: [buffer] }
      );
    } catch (err) {
      this.logger.error("fileReadResponse failed, terminating worker:", err);
      this.worker?.terminate();
      this.worker = void 0;
      this.abort(`File read failed: ${err}`, err.stack || "");
    }
  }
  /**
   * Parse JSON result returned by cpp code.
   * Throw new Error if "__exception" is present in the response
   *
   * TODO: get rid of this function once everything is migrated to Glue
   */
  parseResult(result) {
    const parsedResult = JSON.parse(result);
    if (parsedResult && parsedResult["error"]) {
      throw new WllamaRuntimeError("Unknown error, please see console.log", "");
    }
    return parsedResult;
  }
  /**
   * Push a new task to taskQueue
   */
  pushTask(param, buffers) {
    return new Promise((resolve, reject) => {
      if (this.exited) {
        reject(new WllamaError("The model was unloaded", "model_not_loaded"));
        return;
      }
      this.taskQueue.push({ resolve, reject, param, buffers });
      this.runTaskLoop();
    });
  }
  /**
   * Main loop for processing tasks
   */
  async runTaskLoop() {
    if (this.busy) {
      return;
    }
    this.busy = true;
    while (true) {
      const task = this.taskQueue.shift();
      if (!task) break;
      this.resultQueue.push(task);
      this.worker.postMessage(
        task.param,
        isSafariMobile() ? void 0 : {
          transfer: task.buffers ?? []
        }
      );
    }
    this.busy = false;
  }
  /**
   * Handle messages from worker
   */
  onRecvMsg(e) {
    if (!e.data) return;
    const { verb, args } = e.data;
    if (verb && verb.startsWith("console.")) {
      if (this.suppressNativeLog) {
        return;
      }
      if (verb.endsWith("debug")) this.logger.debug(...args);
      if (verb.endsWith("log")) this.logger.log(...args);
      if (verb.endsWith("warn")) this.logger.warn(...args);
      if (verb.endsWith("error")) this.logger.error(...args);
      return;
    } else if (verb === "signal.abort") {
      const [signalType, message, rawStack, originalErr] = args;
      if (originalErr) {
        this.logger.error(originalErr);
      }
      let stack = "";
      let newMsg = String(message).replace(
        "Build with -sASSERTIONS for more info.",
        ""
      );
      if (signalType === "abort") {
        newMsg = `(ABORT) ${newMsg}`;
        stack = rawStack.replace(/\|/g, "\n");
      } else if (signalType === "exception") {
        stack = rawStack;
      }
      this.logger.error(`Stack trace (${signalType}):
` + stack);
      this.abort(newMsg, stack);
      return;
    }
    if (verb === FILE_READ_REQ_EVENT) {
      const [name, offset, size] = args;
      this.fileReadResponse(name, offset, size).catch(() => {
      });
      return;
    }
    const { callbackId, result, err } = e.data;
    if (callbackId) {
      const idx = this.resultQueue.findIndex(
        (t) => t.param.callbackId === callbackId
      );
      if (idx !== -1) {
        const waitingTask = this.resultQueue.splice(idx, 1)[0];
        if (err) waitingTask.reject(err);
        else waitingTask.resolve(result);
      } else {
        this.logger.error(
          `Cannot find waiting task with callbackId = ${callbackId}`
        );
      }
    }
  }
  abort(text, stack) {
    this.rejectAll(
      new WllamaRuntimeError(text.length == 0 ? "(unknown error)" : text, stack)
    );
  }
  rejectAll(error) {
    while (this.resultQueue.length > 0) {
      const waitingTask = this.resultQueue.pop();
      if (!waitingTask) break;
      waitingTask.reject(error);
    }
    while (this.taskQueue.length > 0) {
      const pendingTask = this.taskQueue.pop();
      if (!pendingTask) break;
      pendingTask.reject(error);
    }
  }
};

// src/huggingface.ts
var HF_BASE = "https://huggingface.co";
var DEFAULT_QUANTS = ["Q4_K_M", "Q8_0"];
async function fetchRepoFiles(repo, token) {
  const url = `${HF_BASE}/api/models/${repo}/tree/main?recursive=true`;
  const headers = { Accept: "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
    }
    throw new Error(`HF API error (${res.status}): ${msg}`);
  }
  return res.json();
}
function firstShardPath(files, path) {
  const m = path.match(/^(.+)-(\d{5})-of-(\d{5})\.gguf$/i);
  if (!m) return path;
  const first = `${m[1]}-00001-of-${m[3]}.gguf`;
  return files.some((f) => f.path === first) ? first : path;
}
function selectFile(files, quant, mmprojOnly) {
  const candidates = files.filter((f) => {
    if (f.type !== "file" || !f.path.toLowerCase().endsWith(".gguf"))
      return false;
    const ismmproj = f.path.toLowerCase().includes("mmproj");
    return mmprojOnly ? ismmproj : !ismmproj;
  });
  if (candidates.length === 0) return null;
  if (quant) {
    const upper = quant.toUpperCase();
    const match = candidates.find((f) => f.path.toUpperCase().includes(upper));
    if (match) return firstShardPath(candidates, match.path);
    return null;
  }
  for (const q of DEFAULT_QUANTS) {
    const match = candidates.find((f) => f.path.toUpperCase().includes(q));
    if (match) return firstShardPath(candidates, match.path);
  }
  return firstShardPath(candidates, candidates[0].path);
}
async function getHFModelSource(config) {
  const { repo, file, quant, mmprojFile, mmprojQuant, hfToken } = config;
  const files = await fetchRepoFiles(repo, hfToken);
  const modelPath = file ?? selectFile(files, quant, false);
  if (!modelPath) {
    throw new Error(`No GGUF file found in repo "${repo}"`);
  }
  const source = {
    url: `${HF_BASE}/${repo}/resolve/main/${modelPath}`
  };
  if (mmprojFile || mmprojQuant !== void 0) {
    const mmpath = mmprojFile ?? selectFile(files, mmprojQuant, true);
    if (mmpath) {
      source.mmprojUrl = `${HF_BASE}/${repo}/resolve/main/${mmpath}`;
    }
  }
  if (hfToken) {
    const params = new URLSearchParams({ token: hfToken });
    source.url += `?${params}`;
    if (source.mmprojUrl) {
      source.mmprojUrl += `?${params}`;
    }
  }
  return source;
}
async function getHFFileSHA256(url, headers) {
  if (!url.includes("/resolve/")) return void 0;
  const rawUrl = url.replace("/resolve/", "/raw/");
  try {
    const text = await fetch(rawUrl, { headers }).then((r) => r.text());
    const match = text.match(/^oid sha256:([0-9a-f]{64})$/m);
    return match ? match[1] : void 0;
  } catch {
    return void 0;
  }
}

// src/storage/opfs.ts
var OPFSBackend = class {
  isSupported() {
    return typeof navigator !== "undefined" && "storage" in navigator && !!navigator.storage?.getDirectory;
  }
  async read(key) {
    try {
      const cacheDir = await getCacheDir();
      const fileHandle = await cacheDir.getFileHandle(key);
      return await fileHandle.getFile();
    } catch (e) {
      return null;
    }
  }
  async write(key, stream, _hint, offset = 0) {
    const writable = await openWritable(key, offset);
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
    } finally {
      await writable.close();
    }
  }
  canWriteAt() {
    return true;
  }
  async getSize(key) {
    try {
      const cacheDir = await getCacheDir();
      const fileHandle = await cacheDir.getFileHandle(key);
      const file = await fileHandle.getFile();
      return file.size;
    } catch (e) {
      return -1;
    }
  }
  async list() {
    const cacheDir = await getCacheDir();
    const result = [];
    for await (const [name, handle] of cacheDir.entries()) {
      if (handle.kind === "file") {
        const file = await handle.getFile();
        result.push({ key: name, size: file.size });
      }
    }
    return result;
  }
  async delete(key) {
    try {
      const cacheDir = await getCacheDir();
      await cacheDir.removeEntry(key);
    } catch (e) {
      if (e?.name !== "NotFoundError") throw e;
    }
  }
};
async function getCacheDir() {
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle("cache", { create: true });
}
async function openWritable(fileName, offset) {
  const worker = createWorker(OPFS_UTILS_WORKER_CODE);
  let pResolve;
  let pReject;
  worker.onmessage = (e) => {
    if (e.data.ok) pResolve(null);
    else if (e.data.err) pReject(e.data.err);
  };
  worker.onerror = (e) => pReject?.(e.message ?? e);
  const workerExec = (data) => new Promise((resolve, reject) => {
    pResolve = resolve;
    pReject = reject;
    worker.postMessage(
      data,
      isSafariMobile() ? void 0 : { transfer: "buf" in data && data.buf ? [data.buf.buffer] : [] }
    );
  });
  await workerExec({ action: "open", filename: fileName, offset });
  return {
    write: (value) => workerExec({ action: "write", buf: value }),
    close: async () => {
      await workerExec({ action: "close" });
      worker.terminate();
    }
  };
}

// src/storage/cos.ts
function makeHash(key) {
  return { algorithm: "SHA-256", value: key };
}
var COSInternalBackend = class {
  isSupported() {
    return typeof navigator !== "undefined" && typeof navigator.crossOriginStorage?.getFileHandle === "function";
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  async read(key) {
    try {
      const handle = await navigator.crossOriginStorage.getFileHandle(
        makeHash(key)
      );
      return handle.getFile();
    } catch {
      return null;
    }
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  async write(key, stream) {
    const handle = await navigator.crossOriginStorage.getFileHandle(
      makeHash(key),
      { create: true, origins: "*" }
    );
    const writable = await handle.createWritable();
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
    } finally {
      await writable.close();
    }
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  async getSize(key) {
    try {
      const handle = await navigator.crossOriginStorage.getFileHandle(
        makeHash(key)
      );
      const file = await handle.getFile();
      return file.size;
    } catch {
      return -1;
    }
  }
  async list() {
    throw new Error("not implemented");
  }
  async delete(_key) {
    throw new Error("not implemented");
  }
};
var COSBackend = class {
  cos = new COSInternalBackend();
  priv = new OPFSBackend();
  isSupported() {
    return this.priv.isSupported();
  }
  async read(key, hint) {
    if (hint?.sha256 && this.cos.isSupported()) {
      const blob = await this.cos.read(hint.sha256);
      if (blob) return blob;
    }
    return this.priv.read(key);
  }
  async write(key, stream, hint, offset = 0) {
    if (hint?.sha256 && this.cos.isSupported()) {
      if (offset > 0) throw new Error("COS backend cannot write at an offset");
      await this.cos.write(hint.sha256, stream);
    } else {
      await this.priv.write(key, stream, void 0, offset);
    }
  }
  canWriteAt(hint) {
    return !(hint?.sha256 && this.cos.isSupported());
  }
  async getSize(key, hint) {
    if (hint?.sha256 && this.cos.isSupported()) {
      const size = await this.cos.getSize(hint.sha256);
      if (size !== -1) return size;
    }
    return this.priv.getSize(key);
  }
  async list() {
    return this.priv.list();
  }
  async delete(key) {
    return this.priv.delete(key);
  }
};

// src/cache-manager.ts
var PREFIX_METADATA = "__metadata__";
var PREFIX_PARTIAL = "__partial__";
var DEFAULT_RETRIES = 5;
var POLYFILL_ETAG = "polyfill_for_older_version";
function hintFromMetadata(metadata) {
  if (!metadata) return void 0;
  if (metadata.sha256) return { sha256: metadata.sha256 };
  return void 0;
}
var CacheManager = class {
  sb;
  /**
   * @param backends Array of storage backends to use, in order of preference ; if first is available, use it, otherwise try the next one.
   */
  constructor(backends = [new COSBackend()]) {
    for (const backend of backends) {
      if (backend.isSupported()) {
        this.sb = backend;
        return;
      }
    }
    throw new Error("No supported storage backend found");
  }
  /**
   * Convert a given URL into a storage key.
   *
   * Format: `${hashSHA1(fullURL)}_${fileName}`
   */
  async getNameFromURL(url) {
    return urlToFileName(url, "");
  }
  /**
   * @deprecated Use `download()` instead
   *
   * Write a new file to cache. This will overwrite existing file.
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   */
  async write(name, stream, metadata) {
    await this.sb.write(name, stream);
    await this.writeMetadata(name, metadata);
  }
  async download(url, options = {}) {
    const fileKey = await urlToFileName(url, "");
    const sha256 = await getHFFileSHA256(url, options.headers ?? {});
    const hint = sha256 ? { sha256 } : void 0;
    const canResume = this.sb.canWriteAt?.(hint) ?? false;
    let offset = 0;
    let etag = "";
    const cachedSize = await this.sb.getSize(fileKey, hint);
    if (cachedSize !== -1) {
      const metadata2 = await this.readMetadata(fileKey);
      if (metadata2?.originalURL === url && metadata2.originalSize === cachedSize) {
        return;
      }
      const partial = metadata2 ? null : await this.readMetadata(`${PREFIX_PARTIAL}${fileKey}`);
      if (canResume && partial?.originalURL === url && isStrongEtag(partial.etag) && cachedSize < partial.originalSize) {
        offset = cachedSize;
        etag = partial.etag;
      } else {
        const head = await fetch(url, {
          method: "HEAD",
          ...options.headers ? { headers: options.headers } : {}
        });
        const originalSize = parseInt(
          head.headers.get("content-length") ?? "0",
          10
        );
        const headEtag = cleanEtag(head.headers.get("etag"));
        if (originalSize > 0 && originalSize === cachedSize) {
          await this.writeMetadata(fileKey, {
            originalURL: url,
            originalSize,
            etag: headEtag,
            sha256,
            ...options.metadataAdditional ?? {}
          });
          return;
        }
        await this.sb.delete(fileKey);
        await this.sb.delete(`${PREFIX_METADATA}${fileKey}`);
      }
    }
    const maxRetries = options.retries ?? DEFAULT_RETRIES;
    const progressCallback = options.progressCallback;
    let total = 0;
    let loaded = 0;
    let failures = 0;
    let kept = offset;
    let resumable = offset > 0;
    while (true) {
      try {
        const response = await fetch(url, {
          headers: {
            ...options.headers ?? {},
            ...offset > 0 ? { Range: `bytes=${offset}-` } : {}
          },
          ...options.signal ? { signal: options.signal } : {}
        });
        if (response.status === 416 && offset > 0) {
          offset = 0;
          resumable = false;
          continue;
        }
        if (!response.ok || !response.body) {
          throw new DownloadHttpError(
            `Failed to fetch ${url}: HTTP ${response.status}`
          );
        }
        const resEtag = response.headers.get("etag") ?? "";
        const range = parseContentRange(response);
        if (offset > 0) {
          const sameFile = response.status === 206 && resEtag === etag && range?.start === offset;
          if (!sameFile) {
            offset = 0;
            resumable = false;
            if (response.status === 206) {
              await response.body.cancel();
              continue;
            }
          }
        }
        etag = resEtag;
        total = response.status === 206 ? range?.total ?? 0 : parseInt(response.headers.get("content-length") ?? "0", 10);
        resumable = canResume && isStrongEtag(etag) && total > 0;
        if (resumable && offset === 0) {
          await this.sb.delete(fileKey);
          await this.writeMetadata(`${PREFIX_PARTIAL}${fileKey}`, {
            originalURL: url,
            originalSize: total,
            etag
          });
        }
        loaded = offset;
        let lastProgressAt = 0;
        const progressStream = new TransformStream({
          transform(chunk, controller) {
            loaded += chunk.byteLength;
            if (progressCallback) {
              const now = Date.now();
              if (now - lastProgressAt > 100) {
                lastProgressAt = now;
                progressCallback({ loaded, total });
              }
            }
            controller.enqueue(chunk);
          },
          flush() {
            progressCallback?.({ loaded, total: total || loaded });
          }
        });
        await this.sb.write(
          fileKey,
          response.body.pipeThrough(progressStream),
          hint,
          offset
        );
        if (total > 0 && loaded < total) {
          throw new Error(`Incomplete download: ${loaded} of ${total} bytes`);
        }
        break;
      } catch (e) {
        const fatal = e instanceof DownloadHttpError || options.signal?.aborted || e?.name === "QuotaExceededError" || // another download has the same file open
        e?.name === "NoModificationAllowedError";
        if (fatal) throw e;
        const size = resumable ? await this.sb.getSize(fileKey, hint) : 0;
        if (size > kept) {
          failures = 0;
          kept = size;
        } else {
          failures++;
        }
        if (maxRetries === 0 || failures > maxRetries) throw e;
        offset = Math.max(size, 0);
        if (failures > 0) {
          await delay(1e3 * 2 ** (failures - 1));
          options.signal?.throwIfAborted();
        }
      }
    }
    const metadata = {
      originalURL: url,
      // without Content-Length, the size is only known once the body is fully read
      originalSize: total || loaded,
      etag: cleanEtag(etag),
      ...options.metadataAdditional ?? {}
    };
    if (sha256) {
      metadata.sha256 = sha256;
    }
    await this.writeMetadata(fileKey, metadata);
    await this.sb.delete(`${PREFIX_METADATA}${PREFIX_PARTIAL}${fileKey}`);
  }
  /**
   * Open a file in cache for reading
   *
   * @param nameOrURL The file name returned by `getNameFromURL()` or `list()`, or the original URL of the remote file
   * @returns Blob, or null if file does not exist
   */
  async open(nameOrURL) {
    const hint1 = hintFromMetadata(await this.getMetadata(nameOrURL));
    const direct = await this.sb.read(nameOrURL, hint1);
    if (direct) return direct;
    const key = await urlToFileName(nameOrURL, "");
    const hint2 = hintFromMetadata(await this.getMetadata(key));
    return this.sb.read(key, hint2);
  }
  /**
   * Get the size of a file in stored cache
   *
   * NOTE: in case the download is stopped mid-way (i.e. user close browser tab), the file maybe corrupted, size maybe different from `metadata.originalSize`
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns number of bytes, or -1 if file does not exist
   */
  async getSize(name) {
    const hint = hintFromMetadata(await this.getMetadata(name));
    return this.sb.getSize(name, hint);
  }
  /**
   * Get metadata of a cached file
   */
  async getMetadata(name) {
    const metadata = await this.readMetadata(name);
    if (metadata) return metadata;
    const cachedSize = await this.sb.getSize(name);
    return cachedSize > 0 ? (
      // files created by older version of wllama don't have metadata; polyfill it
      {
        etag: POLYFILL_ETAG,
        originalSize: cachedSize,
        originalURL: ""
      }
    ) : (
      // cached file not found
      null
    );
  }
  /**
   * Same as `getMetadata()`, but without polyfill. Returns null if the file has no metadata.
   */
  async readMetadata(name) {
    const blob = await this.sb.read(`${PREFIX_METADATA}${name}`);
    if (!blob) return null;
    try {
      return await new Response(blob).json();
    } catch (e) {
      return null;
    }
  }
  /**
   * List all files currently in cache
   */
  async list() {
    const all = await this.sb.list();
    const metadataMap = {};
    for (const { key } of all) {
      if (key.startsWith(PREFIX_METADATA)) {
        const blob = await this.sb.read(key);
        if (blob) {
          const meta = await new Response(blob).json().catch(() => null);
          metadataMap[key.slice(PREFIX_METADATA.length)] = meta;
        }
      }
    }
    const result = [];
    for (const { key, size } of all) {
      if (!key.startsWith(PREFIX_METADATA)) {
        result.push({
          name: key,
          size,
          metadata: metadataMap[key] || {
            originalSize: size,
            originalURL: "",
            etag: ""
          }
        });
      }
    }
    return result;
  }
  /**
   * Clear all files currently in cache
   */
  async clear() {
    await this.deleteMany(() => true);
  }
  /**
   * Delete a single file in cache
   *
   * @param nameOrURL Can be either an URL or a name returned by `getNameFromURL()` or `list()`
   */
  async delete(nameOrURL) {
    const name2 = await this.getNameFromURL(nameOrURL);
    await this.deleteMany(
      (entry) => entry.name === nameOrURL || entry.name === name2
    );
  }
  /**
   * Delete multiple files in cache.
   *
   * @param predicate A predicate like `array.filter(item => boolean)`
   */
  async deleteMany(predicate) {
    const list = await this.list();
    for (const item of list) {
      if (predicate(item)) {
        await this.sb.delete(item.name);
        await this.sb.delete(`${PREFIX_METADATA}${item.name}`);
        await this.sb.delete(`${PREFIX_METADATA}${PREFIX_PARTIAL}${item.name}`);
      }
    }
  }
  /**
   * Write the metadata of the file to disk.
   */
  async writeMetadata(name, metadata) {
    const blob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
    await this.sb.write(`${PREFIX_METADATA}${name}`, blob.stream());
  }
};
var cache_manager_default = CacheManager;
var DownloadHttpError = class extends Error {
};
function cleanEtag(etag) {
  return (etag || "").replace(/[^A-Za-z0-9]/g, "");
}
function isStrongEtag(etag) {
  return !!etag && !etag.startsWith("W/");
}
function parseContentRange(response) {
  const match = /^bytes (\d+)-\d+\/(\d+|\*)$/.exec(
    response.headers.get("content-range") ?? ""
  );
  if (!match) return null;
  return {
    start: parseInt(match[1], 10),
    total: match[2] === "*" ? 0 : parseInt(match[2], 10)
  };
}
async function urlToFileName(url, prefix) {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(url)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${hashHex}_${url.split("/").pop()}`;
}

// src/model-manager.ts
var DEFAULT_PARALLEL_DOWNLOADS = 3;
var ModelValidationStatus = /* @__PURE__ */ ((ModelValidationStatus2) => {
  ModelValidationStatus2["VALID"] = "valid";
  ModelValidationStatus2["INVALID"] = "invalid";
  ModelValidationStatus2["DELETED"] = "deleted";
  return ModelValidationStatus2;
})(ModelValidationStatus || {});
var Model = class {
  modelManager;
  constructor(modelManager, url, mmprojUrl, savedFiles) {
    this.modelManager = modelManager;
    this.url = url;
    this.mmprojUrl = mmprojUrl;
    if (savedFiles) {
      this.files = this.getAllFiles(savedFiles);
      this.size = sumArr(this.files.map((f) => f.metadata.originalSize));
    } else {
      this.files = [];
      this.size = 0;
    }
  }
  /**
   * URL to the GGUF file (in case it contains multiple shards, the URL should point to the first shard)
   *
   * This URL will be used to identify the model in the cache. There can't be 2 models with the same URL.
   */
  url;
  /**
   * URL to mmproj file, if exists
   */
  mmprojUrl;
  /**
   * Size in bytes (total size of all shards).
   *
   * A value of -1 means the model is deleted from the cache. You must call `ModelManager.downloadModel` to re-download the model.
   */
  size;
  /**
   * List of all shards in the cache, sorted by original URL (ascending order)
   */
  files;
  /**
   * Open and get a list of all shards as Blobs
   */
  async open() {
    if (this.size === -1) {
      throw new WllamaError(
        `Model is deleted from the cache; Call ModelManager.downloadModel to re-download the model`,
        "load_error"
      );
    }
    const blobs = [];
    for (const file of this.files) {
      const blob = await this.modelManager.cacheManager.open(file.name);
      if (!blob) {
        throw new Error(
          `Failed to open file ${file.name}; Hint: the model may be invalid, please refresh it`
        );
      }
      blobs.push(blob);
    }
    return blobs;
  }
  /**
   * Validate the model files.
   *
   * If the model is invalid, the model manager will not be able to use it. You must call `refresh` to re-download the model.
   *
   * Cases that model is invalid:
   * - The model is deleted from the cache
   * - The model files are missing (or the download is interrupted)
   */
  validate() {
    const nbFiles = this.getAllUrls().length;
    if (this.size === -1) {
      return "deleted" /* DELETED */;
    }
    if (this.size < 16 || this.files.length !== nbFiles) {
      return "invalid" /* INVALID */;
    }
    for (const file of this.files) {
      if (!file.metadata || file.metadata.originalSize !== file.size) {
        return "invalid" /* INVALID */;
      }
    }
    return "valid" /* VALID */;
  }
  /**
   * In case the model is invalid, call this function to re-download the model
   */
  async refresh(options = {}) {
    const urls = this.getAllUrls();
    const works = urls.map((url, index) => ({
      url,
      index
    }));
    this.modelManager.logger.debug("Downloading model files:", urls);
    const nParallel = this.modelManager.params.parallelDownloads ?? DEFAULT_PARALLEL_DOWNLOADS;
    const totalSize = await this.getTotalDownloadSize(urls);
    const loadedSize = [];
    const worker = async () => {
      while (works.length > 0) {
        const w = works.shift();
        if (!w) break;
        await this.modelManager.cacheManager.download(w.url, {
          ...options,
          metadataAdditional: {
            originalURL: w.url,
            mmprojURL: this.mmprojUrl
          },
          progressCallback: ({ loaded }) => {
            loadedSize[w.index] = loaded;
            options.progressCallback?.({
              loaded: sumArr(loadedSize),
              total: totalSize
            });
          }
        });
      }
    };
    const promises = [];
    for (let i = 0; i < nParallel; i++) {
      promises.push(worker());
      loadedSize.push(0);
    }
    await Promise.all(promises);
    this.files = this.getAllFiles(await this.modelManager.cacheManager.list());
    if (this.files.length !== urls.length) {
      throw new Error(`Model file not found after download: ${this.url}`);
    }
    this.size = this.files.reduce((acc, f) => acc + f.metadata.originalSize, 0);
  }
  /**
   * Remove the model from the cache
   */
  async remove() {
    this.files = this.getAllFiles(await this.modelManager.cacheManager.list());
    await this.modelManager.cacheManager.deleteMany(
      (f) => !!this.files.find((file) => file.name === f.name)
    );
    this.size = -1;
  }
  /**
   * URLs of all files of this model (shards + mmproj), without duplicates
   */
  getAllUrls() {
    const urls = [...ModelManager.parseModelUrl(this.url)];
    if (this.mmprojUrl) {
      urls.push(this.mmprojUrl);
    }
    return [...new Set(urls)];
  }
  getAllFiles(savedFiles) {
    const allFiles = [];
    for (const url of this.getAllUrls()) {
      const file = savedFiles.find((f) => f.metadata.originalURL === url);
      if (!file) {
        continue;
      }
      allFiles.push(file);
    }
    allFiles.sort(
      (a, b) => a.metadata.originalURL.localeCompare(b.metadata.originalURL)
    );
    return allFiles;
  }
  async getTotalDownloadSize(urls) {
    const responses = await Promise.all(
      urls.map((url) => fetch(url, { method: "HEAD" }))
    );
    const sizes = responses.map(
      (res) => Number(res.headers.get("content-length") || "0")
    );
    return sumArr(sizes);
  }
};
var ModelManager = class _ModelManager {
  // The CacheManager singleton, can be accessed by user
  cacheManager;
  params;
  logger;
  constructor(params = {}) {
    this.cacheManager = params.cacheManager || new cache_manager_default();
    this.params = params;
    this.logger = params.logger || console;
  }
  /**
   * Parses a model URL and returns an array of URLs based on the following patterns:
   * - If the input URL is an array, it returns the array itself.
   * - If the input URL is a string in the `gguf-split` format, it returns an array containing the URL of each shard in ascending order.
   * - Otherwise, it returns an array containing the input URL as a single element array.
   * @param modelUrl URL or list of URLs
   */
  static parseModelUrl(modelUrl) {
    if (Array.isArray(modelUrl)) {
      return modelUrl;
    }
    const urlPartsRegex = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
    const queryMatch = modelUrl.match(/\.gguf(\?.*)?$/);
    const queryParams = queryMatch?.[1] ?? "";
    const matches = modelUrl.match(urlPartsRegex);
    if (!matches) {
      return [modelUrl];
    }
    const baseURL = modelUrl.replace(urlPartsRegex, "");
    const total = matches[2];
    const paddedShardIds = Array.from(
      { length: Number(total) },
      (_, index) => (index + 1).toString().padStart(5, "0")
    );
    return paddedShardIds.map(
      (current) => `${baseURL}-${current}-of-${total}.gguf${queryParams}`
    );
  }
  /**
   * Get all models in the cache
   */
  async getModels(opts = {}) {
    const cachedFiles = await this.cacheManager.list();
    let models = [];
    for (const file of cachedFiles) {
      if (!file.metadata.originalURL) continue;
      const shards = _ModelManager.parseModelUrl(file.metadata.originalURL);
      const mmprojUrl = file.metadata.mmprojURL;
      const isFirstShard = shards.length === 1 || shards[0] === file.metadata.originalURL;
      if (isFirstShard) {
        models.push(
          new Model(this, file.metadata.originalURL, mmprojUrl, cachedFiles)
        );
      }
    }
    if (!opts.includeInvalid) {
      models = models.filter(
        (m) => m.validate() === "valid" /* VALID */
      );
    }
    return models;
  }
  /**
   * Download a model from the given URL.
   *
   * The URL must end with `.gguf`
   */
  async downloadModel(sourceOrURL, options = {}) {
    const source = isString(sourceOrURL) ? { url: sourceOrURL } : sourceOrURL;
    if (!isValidGgufFile(source.url)) {
      throw new WllamaError(
        `Invalid model URL: ${source.url}; URL must ends with ".gguf"`,
        "download_error"
      );
    }
    const model = new Model(this, source.url, source.mmprojUrl);
    const validity = model.validate();
    if (validity !== "valid" /* VALID */) {
      await model.refresh(options);
    }
    return model;
  }
  /**
   * Get a model from the cache or download it if it's not available.
   */
  async getModelOrDownload(source, options = {}) {
    const models = await this.getModels();
    const model = models.find((m) => m.url === source.url);
    if (model) {
      options.progressCallback?.({ loaded: model.size, total: model.size });
      return model;
    }
    return this.downloadModel(source, options);
  }
  /**
   * Remove all models from the cache
   */
  async clear() {
    await this.cacheManager.clear();
  }
};

// src/types/types.ts
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 1] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 2] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 3] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 4] = "ERROR";
  return LogLevel2;
})(LogLevel || {});

// src/wasm-from-cdn.ts
var WasmCompatFromCDN = {
  wasm: "https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.13.0/wasm/wllama.wasm"
};

// src/wllama.ts
var LoggerWithoutDebug = {
  ...console,
  debug: () => {
  }
};
var WllamaError = class extends Error {
  type;
  constructor(message, type = "unknown_error") {
    super(message);
    this.type = type;
  }
};
var WllamaAbortError = class extends Error {
  name = "AbortError";
  constructor() {
    super("Operation aborted");
  }
};
var WllamaRuntimeError = class extends Error {
  name = "RuntimeError";
  stack;
  constructor(message, stack) {
    super(message);
    this.stack = stack;
  }
};
var encodeRealtimeAudio = (samples) => {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 32767;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary);
};
var decodeRealtimeAudio = (delta) => {
  const binary = atob(delta);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  return Float32Array.from(pcm, (v) => v / 32768);
};
var REALTIME_BUSY_POLLS = 8;
var REALTIME_IDLE_MS = 20;
var WllamaRealtimeSession = class {
  // a client event was sent since the last poll
  constructor(proxy, reqId) {
    this.proxy = proxy;
    this.reqId = reqId;
  }
  closed = false;
  pending = [];
  // read from the worker, not yet given to a reader
  wakeUp = () => {
  };
  sent = false;
  /**
   * Send a client event, for example `session.update` or `response.create`.
   */
  async send(event) {
    const result = await this.proxy.wllamaAction(
      "realtime_send",
      {
        _name: "rtsd_req",
        req_id: this.reqId,
        data_json: JSON.stringify(event)
      }
    );
    if (!result.success) {
      throw new WllamaError("Realtime session is closed", "inference_error");
    }
    this.sent = true;
    this.wakeUp();
  }
  /**
   * Same as sending `input_audio_buffer.append`.
   * @param samples mono PCM at `LoadedContextInfo.audio_input_rate`
   */
  async appendAudio(samples) {
    await this.send({
      type: "input_audio_buffer.append",
      audio: encodeRealtimeAudio(samples)
    });
  }
  /**
   * Read the server events. It ends when the session ends. Only one reader at a time.
   */
  async *events() {
    let nEmpty = 0;
    while (this.pending.length > 0 || !this.closed) {
      if (this.pending.length > 0) {
        yield this.pending.shift();
        continue;
      }
      const chunk = await this.proxy.wllamaAction(
        "get_result",
        { _name: "gres_req", req_id: this.reqId }
      );
      if (!chunk.has_more) {
        this.closed = true;
      }
      if (this.sent) {
        this.sent = false;
        nEmpty = 0;
      }
      if (chunk.data_json) {
        nEmpty = 0;
        this.pending.push(...JSON.parse(chunk.data_json));
      } else if (++nEmpty > REALTIME_BUSY_POLLS) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, REALTIME_IDLE_MS);
          this.wakeUp = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
    }
  }
  /**
   * End the session and free its slot.
   */
  async close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.pending = [];
    this.wakeUp();
    await this.proxy.wllamaAction("cancel", {
      _name: "cncl_req",
      req_id: this.reqId
    });
  }
};
var Wllama = class {
  // The CacheManager and ModelManager are singleton, can be accessed by user
  cacheManager;
  modelManager;
  compat = null;
  proxy = null;
  config;
  pathConfig;
  useMultiThread = false;
  nbThreads = 1;
  useEmbeddings = false;
  useRerank = false;
  // available when loaded
  loadedContextInfo = null;
  seed = void 0;
  bosToken = -1;
  eosToken = -1;
  eotToken = -1;
  eogTokens = /* @__PURE__ */ new Set();
  addBosToken = false;
  addEosToken = false;
  mediaMarker;
  chatTemplate;
  metadata;
  hasEncoder = false;
  decoderStartToken = -1;
  // note: we overlay instead of using llama-server default_template_kwargs, because we cannot transfer complex data structure via GLUE
  // overlay allow mixed data type or nested structure for kwargs
  chatTemplateKwargs = {};
  constructor(pathConfig, wllamaConfig = {}) {
    checkEnvironmentCompatible();
    if (!pathConfig) throw new WllamaError("AssetsPathConfig is required");
    this.pathConfig = pathConfig;
    this.config = wllamaConfig;
    this.cacheManager = wllamaConfig.cacheManager ?? new cache_manager_default();
    this.modelManager = wllamaConfig.modelManager ?? new ModelManager({
      cacheManager: this.cacheManager,
      logger: wllamaConfig.logger ?? console,
      parallelDownloads: wllamaConfig.parallelDownloads,
      allowOffline: wllamaConfig.allowOffline
    });
    this.setCompat("default");
  }
  logger() {
    return this.config.logger ?? console;
  }
  checkModelLoaded() {
    if (!this.isModelLoaded()) {
      throw new WllamaError(
        "loadModel() is not yet called",
        "model_not_loaded"
      );
    }
  }
  /**
   * Get the libllama version string, e.g. "b6327-4d74393".
   *
   * @returns version string embedded at build time.
   */
  static getLibllamaVersion() {
    return LIBLLAMA_VERSION;
  }
  /**
   * Set compatibility options for Wllama.
   * @param compat Set to null to disable compatibility, or 'default' to use the default compat resources from CDN.
   * @param mode 'safari' by default; If set to 'firefox_safari', the compat mode will **also** be enabled on Firefox, which will significantly degrade the performance but allow using WebGPU on Firefox.
   */
  setCompat(compat, mode = "safari") {
    if (mode === "safari") {
      if (isFirefox()) {
        this.compat = null;
        return;
      }
    }
    this.compat = compat === "default" ? WasmCompatFromCDN : compat;
  }
  /**
   * Check if the model is loaded via `loadModel()`
   */
  isModelLoaded() {
    return !!this.proxy && !!this.metadata;
  }
  /**
   * Get token ID associated to BOS (begin of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getBOS() {
    return this.bosToken;
  }
  /**
   * Get token ID associated to EOS (end of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOS() {
    return this.eosToken;
  }
  /**
   * Get token ID associated to EOT (end of turn) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOT() {
    return this.eotToken;
  }
  /**
   * Check if a given token is end-of-generation token (e.g. EOS, EOT, etc.)
   *
   * @param token the token ID to be checked
   * @returns true if the token is EOS, EOT, or any other end-of-generation tokens
   */
  isTokenEOG(token) {
    return token === this.eosToken || token === this.eotToken || this.eogTokens.has(token);
  }
  /**
   * Get token ID associated to token used by decoder, to start generating output sequence(only usable for encoder-decoder architecture). In other words, encoder uses normal BOS and decoder uses this token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getDecoderStartToken() {
    return this.decoderStartToken;
  }
  /**
   * Get model hyper-parameters and metadata
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns ModelMetadata
   */
  getModelMetadata() {
    this.checkModelLoaded();
    return this.metadata;
  }
  /**
   * Check if we're currently using multi-thread build.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isMultithread() {
    this.checkModelLoaded();
    return this.useMultiThread;
  }
  /**
   * Get number of threads used in the current context.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns number of threads
   */
  getNumThreads() {
    this.checkModelLoaded();
    return this.useMultiThread ? this.nbThreads : 1;
  }
  /**
   * Check if the current model uses encoder-decoder architecture
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isEncoderDecoderArchitecture() {
    this.checkModelLoaded();
    return this.hasEncoder;
  }
  /**
   * Must we add BOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if BOS token must be added to the sequence
   */
  mustAddBosToken() {
    this.checkModelLoaded();
    return this.addBosToken;
  }
  /**
   * Must we add EOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if EOS token must be added to the sequence
   */
  mustAddEosToken() {
    this.checkModelLoaded();
    return this.addEosToken;
  }
  /**
   * Get the jinja chat template comes with the model. It only available if the original model (before converting to gguf) has the template in `tokenizer_config.json`
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns the jinja template. null if there is no template in gguf
   */
  getChatTemplate() {
    this.checkModelLoaded();
    return this.chatTemplate ?? null;
  }
  /**
   * Check if WebGPU is supported by the current environment.
   * @returns true if WebGPU is supported
   */
  isSupportWebGPU() {
    return isSupportWebGPU();
  }
  /**
   * Load model from a given URL (or a list of URLs, in case the model is splitted into smaller files)
   * - If the model already been downloaded (via `downloadModel()`), then we will use the cached model
   * - Else, we download the model from internet
   * @param modelSourceOrURL
   * @param params
   */
  async loadModelFromUrl(modelSourceOrURL, params = {}) {
    const source = isString(modelSourceOrURL) ? { url: modelSourceOrURL } : modelSourceOrURL;
    const useCache = params.useCache ?? true;
    const model = useCache ? await this.modelManager.getModelOrDownload(source, params) : await this.modelManager.downloadModel(source, params);
    const blobs = await model.open();
    return await this.loadModel(blobs, params);
  }
  /**
   * Load model from a given Hugging Face model ID and file path.
   *
   * @param hfOptions
   * @param params
   */
  async loadModelFromHF(hfOptions, params = {}) {
    const source = await getHFModelSource(hfOptions);
    return await this.loadModelFromUrl(source, params);
  }
  /**
   * Load model from a given list of Blob.
   *
   * You can pass multiple buffers into the function (in case the model contains multiple shards).
   *
   * @param ggufBlobsOrModel Can be either list of Blobs (in case you use local file), or a Model object (in case you use ModelManager)
   * @param params LoadModelParams
   */
  async loadModel(ggufBlobsOrModel, params = {}) {
    const blobs = ggufBlobsOrModel instanceof Model ? await ggufBlobsOrModel.open() : [...ggufBlobsOrModel];
    if (blobs.some((b) => b.size === 0)) {
      throw new WllamaError(
        "Input model (or splits) must be non-empty Blob or File",
        "load_error"
      );
    }
    if (!this.pathConfig["default"]) {
      throw new WllamaError(
        '"default" is missing from pathConfig',
        "load_error"
      );
    }
    if (this.proxy) {
      throw new WllamaError("Module is already initialized", "load_error");
    }
    const supportMultiThread = await isSupportMultiThread();
    const hwConccurency = Math.floor((navigator.hardwareConcurrency || 1) / 2);
    const nbThreads = params.n_threads ?? hwConccurency;
    this.nbThreads = nbThreads;
    this.useMultiThread = supportMultiThread && nbThreads > 1;
    const modelFiles = await prepareBlobs(blobs);
    const workerResources = this.getWorkerResources();
    if (params.n_gpu_layers === 0) {
      workerResources.noWebGPU = true;
    } else if (isFirefox() && isSupportWebGPU() && (workerResources.compat || isSupportJSPI())) {
      this.logger().warn(
        "WebGPU on Firefox is slower than on other browsers, due to a Firefox bug (https://bugzilla.mozilla.org/show_bug.cgi?id=1870699). wllama works around most of it, see https://github.com/ngxson/wllama/issues/296"
      );
    }
    this.proxy = new ProxyToWorker(
      workerResources,
      this.useMultiThread ? nbThreads : 0,
      // 0 means disable pthread
      this.config.suppressNativeLog ?? false,
      this.logger()
    );
    let logLevel = params.log_level ?? 2 /* INFO */;
    if (this.config.suppressNativeLog) {
      logLevel = 9999;
    }
    await this.proxy.moduleInit(modelFiles.all);
    this.logger().debug("Calling wllamaStart...");
    const startResult = await this.proxy.wllamaStart();
    if (!startResult.success) {
      throw new WllamaError(
        `Error while calling start function, result = ${startResult}`
      );
    }
    await this.checkWasmVersion(startResult.version);
    this.logger().debug("Loading model...");
    const loadResult = await this.proxy.wllamaAction("load", {
      _name: "load_req",
      log_level: logLevel,
      // if async read is not supported, use mmap; refer to README-dev.md for more details
      use_mmap: !canUseAsyncFileRead(workerResources.compat),
      use_mlock: false,
      n_gpu_layers: params.n_gpu_layers ?? 99999,
      token_embd_on_gpu: params.token_embd_on_gpu ?? true,
      n_ctx: params.n_ctx ?? 1024,
      n_threads: this.useMultiThread ? nbThreads : 1,
      n_ctx_auto: false,
      // not supported for now
      mmproj_path: modelFiles.mmproj ? `/models/${MMPROJ_FILE_NAME}` : void 0,
      model_paths: modelFiles.llm.map((f) => `models/${f.name}`),
      embeddings: params.embeddings,
      offload_kqv: params.offload_kqv,
      n_batch: params.n_batch,
      n_ubatch: params.n_ubatch,
      pooling_type: params.pooling_type,
      rope_scaling_type: params.rope_scaling_type,
      rope_freq_base: params.rope_freq_base,
      rope_freq_scale: params.rope_freq_scale,
      yarn_ext_factor: params.yarn_ext_factor,
      yarn_attn_factor: params.yarn_attn_factor,
      yarn_beta_fast: params.yarn_beta_fast,
      yarn_beta_slow: params.yarn_beta_slow,
      yarn_orig_ctx: params.yarn_orig_ctx,
      cache_type_k: params.cache_type_k,
      cache_type_v: params.cache_type_v,
      // with unified KV, all sequences share one n_ctx cache, so each request can still use the full context
      n_parallel: params.n_parallel ?? 4,
      kv_unified: params.kv_unified ?? true,
      flash_attn: params.flash_attn,
      swa_full: params.swa_full,
      chat_template: params.chat_template,
      jinja: params.jinja,
      reasoning: params.reasoning,
      image_min_tokens: params.image_min_tokens,
      image_max_tokens: params.image_max_tokens,
      warmup: params.warmup,
      no_kv_offload: params.no_kv_offload,
      mmproj_offload: params.mmproj_offload,
      cont_batching: params.cont_batching,
      n_keep: params.n_keep,
      ctx_shift: params.ctx_shift,
      cache_idle_slots: params.cache_idle_slots,
      n_cache_reuse: params.n_cache_reuse,
      // Adapter GGUFs passed with the model blobs are mounted by prepareBlobs and applied at scale 1.
      lora_paths: params.lora_adapters?.map((a) => a.path) ?? (modelFiles.lora.length ? modelFiles.lora.map((f) => `models/${f.name}`) : void 0),
      lora_scales: params.lora_adapters?.map((a) => a.scale ?? 1) ?? (modelFiles.lora.length ? modelFiles.lora.map(() => 1) : void 0),
      lora_init_without_apply: params.lora_init_without_apply,
      spec_draft_model: params.spec_draft_model,
      spec_draft_ngl: params.spec_draft_ngl,
      spec_draft_n_max: params.spec_draft_n_max,
      spec_draft_n_min: params.spec_draft_n_min,
      spec_draft_p_min: params.spec_draft_p_min,
      spec_draft_threads: params.spec_draft_threads,
      spec_draft_threads_batch: params.spec_draft_threads_batch,
      spec_type: params.spec_type,
      spec_ngram_simple_size_n: params.spec_ngram_simple_size_n,
      spec_ngram_simple_size_m: params.spec_ngram_simple_size_m,
      spec_ngram_simple_min_hits: params.spec_ngram_simple_min_hits,
      spec_ngram_mod_n_min: params.spec_ngram_mod_n_min,
      spec_ngram_mod_n_max: params.spec_ngram_mod_n_max,
      spec_ngram_mod_n_match: params.spec_ngram_mod_n_match,
      kv_overrides_keys: params.kv_overrides ? Object.keys(params.kv_overrides) : void 0,
      kv_overrides_vals: params.kv_overrides ? Object.values(params.kv_overrides) : void 0,
      reasoning_budget_tokens: params.reasoning_budget_tokens,
      reasoning_budget_message: params.reasoning_budget_message,
      reasoning_format: params.reasoning_format,
      skip_chat_parsing: params.skip_chat_parsing,
      prefill_assistant: params.prefill_assistant
    });
    if (!loadResult.success) {
      await this.exit();
      throw new WllamaError("Failed to load model", "load_error");
    }
    const loadedCtxInfo = {
      ...loadResult,
      metadata: {}
    };
    for (let i = 0; i < loadResult.metadata_key.length; i++) {
      loadedCtxInfo.metadata[loadResult.metadata_key[i]] = loadResult.metadata_val[i];
    }
    this.seed = params.seed;
    this.bosToken = loadedCtxInfo.token_bos;
    this.eosToken = loadedCtxInfo.token_eos;
    this.eotToken = loadedCtxInfo.token_eot;
    this.useEmbeddings = !!params.embeddings;
    this.useRerank = params.pooling_type == "rank";
    this.metadata = {
      hparams: {
        nVocab: loadedCtxInfo.n_vocab,
        nCtxTrain: loadedCtxInfo.n_ctx_train,
        nEmbd: loadedCtxInfo.n_embd,
        nLayer: loadedCtxInfo.n_layer
      },
      meta: loadedCtxInfo.metadata
    };
    this.hasEncoder = !!loadedCtxInfo.has_encoder;
    this.decoderStartToken = loadedCtxInfo.token_decoder_start;
    this.addBosToken = loadedCtxInfo.add_bos_token;
    this.addEosToken = loadedCtxInfo.add_eos_token;
    this.chatTemplate = loadedCtxInfo.metadata["tokenizer.chat_template"];
    this.loadedContextInfo = loadedCtxInfo;
    this.eogTokens = new Set(loadedCtxInfo.list_tokens_eog);
    this.mediaMarker = loadedCtxInfo.media_marker;
    this.chatTemplateKwargs = params.default_template_kwargs ?? {};
    this.logger().debug({ loadedCtxInfo });
  }
  getLoadedContextInfo() {
    this.checkModelLoaded();
    if (!this.loadedContextInfo) {
      throw new WllamaError("Loaded context info is not available");
    }
    return { ...this.loadedContextInfo };
  }
  //////////////////////////////////////////////
  // High level API
  /**
   * Calculate embedding vector for a given text or multimodal input.
   * By default, BOS and EOS tokens will be added automatically. You can use the "skipBOS" and "skipEOS" option to disable it.
   * @param options OAI-compatible embedding creation options
   * @returns OAI-compatible embedding response
   */
  async createEmbedding(options) {
    this.checkModelLoaded();
    if (!this.useEmbeddings) {
      throw new WllamaError(
        "Embeddings is not enabled. Please set it via LoadModelParams.embeddings"
      );
    }
    if (options.embd_normalize !== void 0 && (!Number.isInteger(options.embd_normalize) || options.embd_normalize < -1)) {
      throw new WllamaError(
        "embd_normalize must be an integer >= -1",
        "inference_error"
      );
    }
    const { input, files } = this.prepareEmbeddingInput(options.input);
    const result = await this.proxy.wllamaAction(
      "embedding",
      {
        _name: "embd_req",
        data_json: JSON.stringify({ ...options, input }),
        files: files.map((f) => new Uint8Array(f))
      }
    );
    if (!result.success) {
      throw new WllamaError(
        result.message || "Model failed to start inference",
        "inference_error"
      );
    }
    return await this.getResponse(options, false, result.req_id);
  }
  /**
   * Rerank a list of documents against a query.
   * Requires the model to be loaded with embeddings: true and pooling_type: 'rank'.
   * @param options Reranking options (query, documents, top_n)
   * @returns Reranking response with relevance scores sorted highest first
   */
  async createRerank(options) {
    this.checkModelLoaded();
    if (!this.useEmbeddings || !this.useRerank) {
      throw new WllamaError(
        "Rerank is not enabled. Please set it via LoadModelParams: embeddings = true and pooling_type = rank"
      );
    }
    const top_n = options.top_n ?? options.documents.length;
    let totalTokens = 0;
    const rawResults = [];
    for (let i = 0; i < options.documents.length; i++) {
      const result = await this.proxy.wllamaAction("rerank", {
        _name: "rrnk_req",
        data_json: JSON.stringify({
          query: options.query,
          document: options.documents[i]
        })
      });
      if (!result.success) {
        throw new WllamaError(
          "Model failed to start reranking",
          "inference_error"
        );
      }
      const { score, tokens_evaluated } = await this.getSingleResult(result.req_id, "reranking");
      totalTokens += tokens_evaluated;
      rawResults.push({ index: i, score });
    }
    rawResults.sort((a, b) => b.score - a.score);
    return {
      model: this.getModelMetadata().meta["general.name"] ?? "",
      object: "list",
      usage: { prompt_tokens: totalTokens, total_tokens: totalTokens },
      results: rawResults.slice(0, top_n).map(({ index, score }) => ({
        index,
        relevance_score: score
      }))
    };
  }
  /**
   * Answer typed questions about a state, using a decision model (TypeSafe-compatible System One API).
   * Image input is not supported yet.
   * @param options The state and the questions
   * @returns The answer of each question
   */
  async createSystemOne(options) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "systemone",
      {
        _name: "sys1_req",
        data_json: JSON.stringify(options)
      }
    );
    if (!result.success) {
      throw new WllamaError(
        "Model failed to start systemone",
        "inference_error"
      );
    }
    return await this.getSingleResult(
      result.req_id,
      "systemone"
    );
  }
  async createSpeech(options) {
    this.checkModelLoaded();
    const chunks = this.getSpeechChunks(options, this.proxy);
    if (options.stream) {
      return chunks;
    }
    for await (const chunk of chunks) {
      if (chunk.final) {
        return { audio: chunk.audio, sample_rate: chunk.sample_rate };
      }
    }
    throw new WllamaError("No speech result received", "inference_error");
  }
  async createTranscription(options) {
    this.checkModelLoaded();
    if (!this.supportInputModality("audio")) {
      throw new WllamaError(
        "Audio input is not supported by the loaded model",
        "inference_error"
      );
    }
    if (options.stream && options.onData) {
      await this.createCompletionImpl(options);
    } else if (options.stream) {
      return await this.createCompletionGenerator(options);
    } else {
      return await this.createCompletionImpl({ ...options, stream: false });
    }
  }
  /**
   * Start a realtime audio session. The model must support it, see `LoadedContextInfo.has_audio_stream`.
   * It holds one slot until `close()` is called.
   * @param options session options
   * @returns the session
   */
  async createRealtimeSession(options = {}) {
    this.checkModelLoaded();
    const customOpt = this.seed !== void 0 ? { seed: this.seed } : {};
    const result = await this.proxy.wllamaAction(
      "realtime_start",
      {
        _name: "rtst_req",
        data_json: JSON.stringify({ ...customOpt, ...options })
      }
    );
    if (!result.success) {
      throw new WllamaError(
        result.message || "Model failed to start realtime session",
        "inference_error"
      );
    }
    return new WllamaRealtimeSession(this.proxy, result.req_id);
  }
  async createChatCompletion(options) {
    if (Object.keys(this.chatTemplateKwargs).length > 0) {
      options = {
        ...options,
        chat_template_kwargs: {
          ...this.chatTemplateKwargs,
          ...options.chat_template_kwargs ?? {}
        }
      };
    }
    if (options.stream && options.onData) {
      await this.createCompletionImpl(options);
    } else if (options.stream) {
      return await this.createCompletionGenerator(options);
    } else {
      return await this.createCompletionImpl({ ...options, stream: false });
    }
  }
  async createCompletion(options) {
    if (options.stream && options.onData) {
      await this.createCompletionImpl(options);
    } else if (options.stream) {
      return await this.createCompletionGenerator(options);
    } else {
      return await this.createCompletionImpl({ ...options, stream: false });
    }
  }
  /**
   * Private implementation of createCompletion
   */
  async createCompletionImpl(options) {
    this.checkModelLoaded();
    const isStream = !!options.stream;
    const isChat = !!options.messages;
    const isAsr = !!options.file;
    const customOpt = {};
    if (this.seed !== void 0) {
      customOpt.seed = this.seed;
    }
    let files = [];
    if (isAsr) {
      const { file, ...rest } = options;
      files = [file];
      const formFields = {};
      for (const key of ["stream", "max_tokens", "temperature"]) {
        if (rest[key] !== void 0) {
          formFields[key] = String(rest[key]);
        }
      }
      options = { ...rest, ...formFields };
    }
    if (isChat) {
      const tmp = this.prepareMultimodalInput(
        options
      );
      options = tmp.params;
      files = tmp.files;
    }
    const result = await this.proxy.wllamaAction(
      "completion",
      {
        _name: "cmpl_req",
        is_chat: isChat,
        is_asr: isAsr,
        data_json: JSON.stringify({ ...options, ...customOpt }),
        files: files.map((f) => new Uint8Array(f))
      }
    );
    if (!result.success) {
      throw new WllamaError(
        "Model failed to start inference",
        "inference_error"
      );
    }
    return await this.getResponse(
      options,
      isStream,
      result.req_id
    );
  }
  /**
   * Same with `createCompletion`, but returns an async iterator instead.
   * Only called when stream=true and no onData is provided.
   */
  createCompletionGenerator(options) {
    return new Promise((resolve) => {
      const createGenerator = cbToAsyncIter(
        (callback) => {
          this.createCompletionImpl({
            ...options,
            onData: (chunk) => callback(chunk)
          }).then(() => callback(void 0, true)).catch((err) => callback(void 0, false, err));
        }
      );
      resolve(createGenerator());
    });
  }
  /**
   * Whether the currently loaded model supports a specific input modality (e.g. image or audio).
   * @param modality
   * @returns
   */
  supportInputModality(modality) {
    this.checkModelLoaded();
    if (modality === "image") {
      return !!this.loadedContextInfo.has_image_input;
    } else if (modality === "audio") {
      return !!this.loadedContextInfo.has_audio_input;
    } else if (modality === "video") {
      return !!this.loadedContextInfo.has_video_input;
    } else {
      throw new WllamaError(
        "Unsupported modality: " + modality,
        "unknown_error"
      );
    }
  }
  /**
   * Save the state of a slot (the processed prompt), to restore it later with `restoreSlotState()`.
   *
   * The state can only be restored with the same model and the same wllama version.
   *
   * @param idSlot ID of the slot, between 0 and `n_parallel - 1`
   * @returns the state, you can store it (for example in OPFS)
   */
  async saveSlotState(idSlot = 0) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "slot_save",
      {
        _name: "slsv_req",
        id_slot: idSlot
      }
    );
    if (!result.success) {
      throw new WllamaError(
        result.message || "Failed to save slot state",
        "inference_error"
      );
    }
    return result.data;
  }
  /**
   * Restore the state of a slot from the output of `saveSlotState()`.
   *
   * The next request that starts with the same prompt reuses it.
   *
   * @param data The saved state
   * @param idSlot ID of the slot, between 0 and `n_parallel - 1`
   * @returns number of tokens in the restored prompt
   */
  async restoreSlotState(data, idSlot = 0) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "slot_restore",
      {
        _name: "slrs_req",
        id_slot: idSlot,
        data
      }
    );
    if (!result.success) {
      throw new WllamaError(
        result.message || "Failed to restore slot state",
        "inference_error"
      );
    }
    return result.n_tokens;
  }
  /**
   * Unload the model and free all memory.
   *
   * Note: This function will NOT crash if model is not yet loaded
   */
  async exit() {
    await this.proxy?.wllamaExit();
    this.proxy = null;
  }
  /**
   * [FOR DEBUGGING ONLY] Run ggml backend ops tests without loading any model.
   *
   * Initializes the wasm runtime, executes `test-backend-ops` with the given args, then shuts down.
   *
   * For more info, please refer to guides/debug.md
   *
   * @param args Arguments forwarded to test-backend-ops (e.g. ["-o", "ADD"])
   * @returns retcode (0 = all tests passed) and success flag
   */
  async testBackendOps(args = []) {
    if (!this.pathConfig["default"]) {
      throw new WllamaError(
        '"default" is missing from pathConfig',
        "load_error"
      );
    }
    if (!await isSupportMultiThread()) {
      throw new WllamaError(
        "Multi-threading is required to run backend ops tests, but it is not supported in the current environment."
      );
    }
    const tmpProxy = new ProxyToWorker(
      this.getWorkerResources(),
      0,
      // single-thread; no model needed
      this.config.suppressNativeLog ?? false,
      this.logger()
    );
    try {
      await tmpProxy.moduleInit([]);
      const startResult = await tmpProxy.wllamaStart();
      if (!startResult.success) {
        throw new WllamaError(
          `Error while calling start function, result = ${startResult}`
        );
      }
      const result = await tmpProxy.wllamaAction(
        "test_backend_ops",
        { _name: "tbop_req", args: ["test-backend-ops", ...args] }
      );
      return { retcode: result.retcode, success: result.success };
    } finally {
      await tmpProxy.wllamaExit();
    }
  }
  //////////////////////////////////////////////
  // Low level API
  // TODO: add back
  /**
   * get debug info
   */
  async _getDebugInfo() {
    this.checkModelLoaded();
    return await this.proxy.wllamaDebug();
  }
  //////////////////////////////////////////////
  // Utils
  jsonDecode(data_json) {
    try {
      return JSON.parse(data_json);
    } catch (e) {
      this.logger().error("Failed to parse JSON:", data_json);
      throw new WllamaError("Failed to parse model output", "inference_error");
    }
  }
  replaceMedia(content, files) {
    return content.map((c) => {
      if (c.type === "text") {
        return c;
      }
      if (!this.mediaMarker) {
        throw new WllamaError("Media marker is undefined", "inference_error");
      }
      files.push(c.data);
      return { type: "text", text: this.mediaMarker };
    });
  }
  prepareMultimodalInput(params) {
    const msg = params.messages;
    const msgNew = [];
    const files = [];
    for (const m of msg) {
      if (Array.isArray(m.content)) {
        msgNew.push({
          ...m,
          content: this.replaceMedia(m.content, files)
        });
      } else {
        msgNew.push(m);
      }
    }
    return {
      params: {
        ...params,
        messages: msgNew
      },
      files
    };
  }
  prepareEmbeddingInput(input) {
    const files = [];
    const isContentPart = (entry) => typeof entry === "object" && entry !== null && "type" in entry && (entry.type === "text" || entry.type === "image");
    const isContent = (entry) => Array.isArray(entry) && entry.length > 0 && entry.every(isContentPart);
    const toText = (content) => {
      if (content.some((c) => c.type === "text" && typeof c.text !== "string")) {
        throw new WllamaError(
          'Text input must contain a string in "text"',
          "inference_error"
        );
      }
      const text = this.replaceMedia(content, files).map((c) => c.text).join("");
      if (text.length === 0) {
        throw new WllamaError(
          "Input content cannot be empty",
          "inference_error"
        );
      }
      return text;
    };
    let prepared = input;
    if (isContent(input)) {
      prepared = toText(input);
    } else if (Array.isArray(input) && input.length > 0 && input.every(isContent)) {
      prepared = input.map(toText);
    }
    if (files.length > 0 && !this.supportInputModality("image")) {
      throw new WllamaError(
        "Image input is not supported by the loaded model",
        "inference_error"
      );
    }
    return { input: prepared, files };
  }
  // release the slot occupied by the request; cancelling an already-finished request is a no-op
  async cancelRequest(reqId) {
    try {
      await this.proxy.wllamaAction("cancel", {
        _name: "cncl_req",
        req_id: reqId
      });
    } catch (e) {
      this.logger().warn("Failed to cancel request", reqId, e);
    }
  }
  async *getSpeechChunks(options, proxy) {
    const { speaker_ref, abortSignal, ...params } = options;
    if (abortSignal?.aborted) {
      throw new WllamaAbortError();
    }
    if (this.proxy !== proxy) {
      throw new WllamaError(
        "The model of this speech stream is not loaded anymore",
        "inference_error"
      );
    }
    const customOpt = this.seed !== void 0 ? { seed: this.seed } : {};
    const result = await proxy.wllamaAction("tts", {
      _name: "tts__req",
      data_json: JSON.stringify({ ...customOpt, ...params }),
      files: speaker_ref ? [new Uint8Array(speaker_ref)] : []
    });
    if (!result.success) {
      throw new WllamaError(
        result.message || "Model failed to start speech generation",
        "inference_error"
      );
    }
    const reqId = result.req_id;
    const cancel = async () => {
      if (this.proxy === proxy) {
        await this.cancelRequest(reqId);
      }
    };
    const onAbort = () => void cancel();
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    let completed = false;
    try {
      while (true) {
        if (abortSignal?.aborted) {
          throw new WllamaAbortError();
        }
        const chunk = await proxy.wllamaAction(
          "get_result",
          { _name: "gres_req", req_id: reqId }
        );
        if (abortSignal?.aborted) {
          throw new WllamaAbortError();
        }
        completed = !chunk.has_more;
        if (chunk.data_json) {
          const data = this.jsonDecode(chunk.data_json);
          if (chunk.is_error) {
            throw new WllamaError(
              data.message || "Unknown speech error",
              "inference_error"
            );
          }
          yield {
            audio: chunk.data_raw.slice().buffer,
            sample_rate: data.sample_rate,
            final: data.final
          };
        }
        if (completed) {
          return;
        }
      }
    } finally {
      abortSignal?.removeEventListener("abort", onAbort);
      if (!completed) {
        await cancel();
      }
    }
  }
  async getSingleResult(reqId, task) {
    let completed = false;
    try {
      while (true) {
        const chunk = await this.proxy.wllamaAction(
          "get_result",
          { _name: "gres_req", req_id: reqId }
        );
        const jsonString = chunk.data_json;
        if (jsonString && jsonString.length > 0) {
          if (chunk.is_error) {
            const jsonData = this.jsonDecode(jsonString);
            throw new WllamaError(
              jsonData.message || `Unknown ${task} error`,
              "inference_error"
            );
          }
          completed = true;
          return this.jsonDecode(jsonString);
        }
        if (!chunk.has_more) {
          completed = true;
          break;
        }
      }
      throw new WllamaError(`No ${task} result received`, "inference_error");
    } finally {
      if (!completed) {
        await this.cancelRequest(reqId);
      }
    }
  }
  async getResponse(options, isStream, reqId) {
    let finalResult = null;
    let completed = false;
    try {
      while (true) {
        if (options.abortSignal?.aborted) {
          throw new WllamaAbortError();
        }
        const result_chunk = await this.proxy.wllamaAction(
          "get_result",
          {
            _name: "gres_req",
            req_id: reqId
          }
        );
        const jsonString = result_chunk.data_json;
        if (!jsonString || jsonString.length === 0) {
          if (!result_chunk.has_more) {
            completed = true;
            break;
          } else {
            continue;
          }
        }
        if (jsonString == "null") {
          continue;
        }
        let jsonData = this.jsonDecode(jsonString);
        finalResult = jsonData;
        if (result_chunk.is_error) {
          this.logger().error("Model returned an error:", jsonData);
          throw new WllamaError(
            jsonData.message || "Unknown inference error",
            "inference_error"
          );
        }
        if (isStream) {
          if (!Array.isArray(jsonData)) {
            jsonData = [jsonData];
          }
          for (const chunk of jsonData) {
            options.onData?.(chunk);
            finalResult = chunk;
          }
        }
        if (!result_chunk.has_more) {
          completed = true;
          break;
        }
      }
    } finally {
      if (!completed) {
        await this.cancelRequest(reqId);
      }
    }
    return finalResult;
  }
  async checkWasmVersion(wasmVersion) {
    const getCommit = (version) => version?.split("-").pop();
    if (getCommit(wasmVersion) === getCommit(LIBLLAMA_VERSION)) {
      return;
    }
    const message = `wasm file version (${wasmVersion ?? "unknown"}) does not match the expected version (${LIBLLAMA_VERSION})`;
    if (this.config.skipVersionCheck) {
      this.logger().warn(message);
      return;
    }
    await this.exit();
    throw new WllamaError(
      `${message}. Use the wasm file from the same release, or set skipVersionCheck to ignore this error`,
      "version_mismatch"
    );
  }
  getWorkerResources() {
    const workerResources = {
      wasmPath: absoluteUrl(this.pathConfig["default"]),
      compat: false
    };
    if (needCompat()) {
      if (!this.compat) {
        this.logger().warn(
          "Not using compat mode" + (isFirefox() ? " (expected on Firefox - WebGPU will be disabled)" : "")
        );
      } else {
        const isUsingDefault = this.compat.wasm === WasmCompatFromCDN.wasm;
        if (isUsingDefault) {
          this.logger().warn(
            "Compatibility mode is activated, using resources from CDN. To use local resources, please refer to @wllama/wllama-compat package."
          );
          this.logger().warn(
            "IMPORTANT: Performance will be significantly degraded in compatibility mode."
          );
        }
        workerResources.wasmPath = absoluteUrl(this.compat.wasm);
        workerResources.jsPath = this.compat.worker;
        workerResources.compat = true;
      }
    }
    if (isFirefox()) {
      if (workerResources.compat) {
        this.logger().warn(
          'Using compat mode on Firefox, performance will be significantly degraded; Consider enabling "javascript.options.wasm_js_promise_integration" in "about:config".'
        );
      } else if (!isSupportJSPI()) {
        this.logger().warn(
          'WebGPU is disabled on Firefox due to missing JSPI support. Please consider enabling compat mode, or enabling "javascript.options.wasm_js_promise_integration" in "about:config".'
        );
      }
    }
    return workerResources;
  }
};

// src/video.ts
var DEFAULT_FPS = 2;
var DEFAULT_MAX_FRAMES = 32;
var DEFAULT_MAX_EDGE = 512;
var MIN_FRAMES = 4;
var JPEG_QUALITY = 0.9;
var EVENT_TIMEOUT_MS = 3e4;
var RAW_MAGIC = [87, 76, 86, 70];
var RAW_VERSION = 1;
var RAW_HEADER_SIZE = 24;
var getVideoSampleTimes = (duration, fps, maxFrames) => {
  const n = Math.min(
    Math.max(Math.floor(duration * fps), MIN_FRAMES),
    Math.floor(maxFrames)
  );
  return Array.from({ length: n }, (_, i) => i * duration / n);
};
var waitForEvent = (video, event) => new Promise((resolve, reject) => {
  const cleanup = () => {
    clearTimeout(timer);
    video.removeEventListener(event, onEvent);
    video.removeEventListener("error", onError);
  };
  const onEvent = () => {
    cleanup();
    resolve();
  };
  const onError = () => {
    cleanup();
    const reason = video.error?.message || "unknown error";
    reject(
      new WllamaError(`Cannot read video: ${reason}`, "inference_error")
    );
  };
  const timer = setTimeout(() => {
    cleanup();
    reject(
      new WllamaError(`Timeout on video event: ${event}`, "inference_error")
    );
  }, EVENT_TIMEOUT_MS);
  video.addEventListener(event, onEvent);
  video.addEventListener("error", onError);
});
var seekTo = (video, time) => {
  const seeked = waitForEvent(video, "seeked");
  video.currentTime = time;
  return seeked;
};
var encodeJpeg = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(
      new WllamaError("Cannot encode video frame", "inference_error")
    ),
    "image/jpeg",
    JPEG_QUALITY
  );
});
var readVideoFrames = async (source, options, onFrame) => {
  const fps = options.fps ?? DEFAULT_FPS;
  const maxFrames = options.maxFrames ?? DEFAULT_MAX_FRAMES;
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  if (!(fps > 0) || !(maxFrames >= 1) || !(maxEdge >= 1)) {
    throw new WllamaError(
      "fps, maxFrames and maxEdge must be positive",
      "inference_error"
    );
  }
  if (typeof document === "undefined") {
    throw new WllamaError(
      "Video sampling needs the DOM, it cannot run in a web worker",
      "inference_error"
    );
  }
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const isUrl = typeof source === "string";
  if (isUrl) {
    video.crossOrigin = "anonymous";
  }
  const src = isUrl ? source : URL.createObjectURL(source);
  try {
    const loaded = waitForEvent(video, "loadeddata");
    video.src = src;
    await loaded;
    if (!video.videoWidth || !video.videoHeight) {
      throw new WllamaError("File has no video track", "inference_error");
    }
    if (!Number.isFinite(video.duration)) {
      await seekTo(video, Number.MAX_SAFE_INTEGER);
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new WllamaError("Cannot get video duration", "inference_error");
    }
    const scale = Math.min(
      1,
      maxEdge / Math.max(video.videoWidth, video.videoHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new WllamaError("Cannot create 2D canvas", "inference_error");
    }
    const duration = video.duration;
    const times = getVideoSampleTimes(duration, fps, maxFrames);
    for (let index = 0; index < times.length; index++) {
      await seekTo(video, times[index]);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      await onFrame({
        ctx,
        time: times[index],
        index,
        count: times.length,
        fps: times.length / duration
      });
    }
  } finally {
    video.removeAttribute("src");
    video.load();
    if (!isUrl) {
      URL.revokeObjectURL(src);
    }
  }
};
var sampleVideoFrames = async (source, options = {}) => {
  const frames = [];
  await readVideoFrames(source, options, async ({ ctx, time }) => {
    const blob = await encodeJpeg(ctx.canvas);
    frames.push({ time, data: await blob.arrayBuffer() });
  });
  return frames;
};
var sampleVideo = async (source, options = {}) => {
  let out = new Uint8Array(0);
  await readVideoFrames(source, options, ({ ctx, index, count, fps }) => {
    const { width, height } = ctx.canvas;
    const frameSize = width * height * 3;
    if (index === 0) {
      out = new Uint8Array(RAW_HEADER_SIZE + count * frameSize);
      out.set(RAW_MAGIC);
      const header = new DataView(out.buffer);
      header.setUint32(4, RAW_VERSION, true);
      header.setUint32(8, width, true);
      header.setUint32(12, height, true);
      header.setUint32(16, count, true);
      header.setFloat32(20, fps, true);
    }
    const rgba = ctx.getImageData(0, 0, width, height).data;
    let pos = RAW_HEADER_SIZE + index * frameSize;
    for (let i = 0; i < rgba.length; i += 4) {
      out[pos++] = rgba[i];
      out[pos++] = rgba[i + 1];
      out[pos++] = rgba[i + 2];
    }
  });
  return out.buffer;
};
var videoToMessageContent = async (source, options = {}) => {
  const frames = await sampleVideoFrames(source, options);
  return frames.flatMap(({ time, data }) => [
    { type: "text", text: `<${time.toFixed(1)} seconds>` },
    { type: "image", data }
  ]);
};
export {
  CacheManager,
  LogLevel,
  LoggerWithoutDebug,
  Model,
  ModelManager,
  ModelValidationStatus,
  POLYFILL_ETAG,
  Wllama,
  WllamaAbortError,
  WllamaError,
  WllamaRealtimeSession,
  WllamaRuntimeError,
  decodeRealtimeAudio,
  encodeRealtimeAudio,
  getHFFileSHA256,
  getHFModelSource,
  getVideoSampleTimes,
  isValidGgufFile,
  sampleVideo,
  sampleVideoFrames,
  videoToMessageContent
};
