// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';

export const usePermission = (name) => {
  const userInfo = useSelector(state => state.userInfo.userInfo)
  const permissionList = useSelector(state => state.permissionList.permissionList)
  const [hasPermission, setHasPermission] = useState(false) // 当前权限是否允许
  const [permissions, setPermissions] = useState([])  // 当前用户允许的权限列表

  useEffect(() => {
    // 根据名字区分，原先是根据id,摒弃原因为：当权限list中间插入或删除某条权限数据时，会导致id变更，一旦变更，涉及的Id均需改变，不好维护
    if (userInfo.uid && permissionList.permission) {
      let params = userInfo.isAdmin ? 'admin' : 'common'
      let namePerArr = [];
      permissionList.permission.map(item => {
        item.permissionList.map(sub => {
          if (permissionList.rolePermissionId[params].permissionIds.includes(sub.id)) {
            namePerArr.push(sub.name);
          }
        })
      })
      setHasPermission(namePerArr.includes(name))
      setPermissions(permissionList.rolePermissionId[params].permissionIds)
    }
  }, [userInfo, permissionList])
  return {hasPermission, permissions}
}
