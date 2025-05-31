# Ubuntu WSL config

---

## Update

```shell
# Check update

sudo apt update

# Install update

sudo apt upgrade
```

## Chinese support

```shell
sudo apt-get install language-pack-zh-hans
sudo update-locale LANG=zh_CN.UTF-8
```

```powershell
wsl --shutdown
```

## Fonts

```shell
# link Windows Fonts

sudo ln -s /mnt/c/Windows/Fonts /usr/share/fonts/font

# Refresh

fc-cache -fv
```

## Software

## Zsh

```shell
# Oh My Zsh

sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# zsh-autosuggestions

git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

# zsh-syntax-highlighting

git clone https://github.com/zsh-users/zsh-syntax-highlighting.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
```
