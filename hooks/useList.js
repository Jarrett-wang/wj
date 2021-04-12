// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect } from 'react';

function useList({ apiMethod, initParams }) {
  const [params, doSearch] = useState(initParams);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagingConfig, setPagingConfig] = useState(null);

  useEffect(loadList, [params]);
  function loadList() {
    // 调用时不传initParams参数，通常可以用来处理在首次使用hooks时不立即进行搜索
    if(!params) return;
    if(!apiMethod) return;
    setLoading(true);
    apiMethod(params).then(({data: {list, total}}) => {
      setList(list);
      setTotal(total);
      setPagingConfig({
        showQuickJumper: true,
        showSizeChanger: true,
        total: total,
        current: params.pageNum,
        pageSize: params.pageSize
      });
      setLoading(false);
      // eslint-disable-next-line no-unused-vars
    }).catch(e => {
      setLoading(false)
    });
  }

  return { doSearch, loading, list, total, pagingConfig, loadList };
}

export default useList;
