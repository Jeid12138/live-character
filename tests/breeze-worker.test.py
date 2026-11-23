"""Breeze worker residency tests without loading weights or using CUDA."""
import contextlib
import pathlib
import sys
import types
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'lab'))
import breeze_worker as worker


class Tensor:
    def __init__(self, device='cuda:0'):
        self.device = device
        self.is_meta = device == 'meta'

    def to(self, device):
        return Tensor(device)


class Module:
    def __init__(self, *, separate_rope=False):
        self.weights = Tensor()
        self.rotary = types.SimpleNamespace(inv_freq=Tensor())
        self.rotary.original_inv_freq = Tensor() if separate_rope else self.rotary.inv_freq

    def modules(self):
        return (self, self.rotary)

    def to(self, device):
        self.weights = self.weights.to(device)
        self.rotary.inv_freq = self.rotary.inv_freq.to(device)


class ResidencyTest(unittest.TestCase):
    def setUp(self):
        self.cuda = Mock()
        torch = types.SimpleNamespace(cuda=self.cuda, Tensor=Tensor, device=str)
        self.enterContext(patch.dict(sys.modules, torch=torch))
        self.loader = types.SimpleNamespace(_silence_captured_pool_warnings=contextlib.nullcontext)
        self.hot, self.cold = object(), object()
        self.bundle = types.SimpleNamespace(model=Module(), codec=Module(separate_rope=True),
                                            tokenizer=object(), device='cuda:0', patchers=[])
        self.bundle.model._breeze_depth_runners = {1: self.cold, 2: self.hot}

    def test_only_opted_in_request_prunes_inactive_runner(self):
        model = self.bundle.model

        def get_depth_runner(model, params, cfg_scale, batch, use_graph):
            return model._breeze_depth_runners[batch]

        runtime = types.SimpleNamespace(get_depth_runner=get_depth_runner)
        with worker.retain_active_runner(self.loader, runtime, self.bundle, False):
            self.assertIs(runtime.get_depth_runner(model, None, 4, 2, True), self.hot)
        self.assertEqual(model._breeze_depth_runners, {1: self.cold, 2: self.hot})
        self.cuda.synchronize.assert_not_called()

        with worker.retain_active_runner(self.loader, runtime, self.bundle, True):
            self.assertIs(runtime.get_depth_runner(model, None, 4, 2, True), self.hot)
            self.assertEqual(model._breeze_depth_runners, {2: self.hot})
        self.assertIs(runtime.get_depth_runner, get_depth_runner)

    def test_sleep_clears_graphs_and_roundtrips_the_same_modules(self):
        model, codec, tokenizer = self.bundle.model, self.bundle.codec, self.bundle.tokenizer
        worker.park_bundle(self.loader, self.bundle)
        self.assertFalse(model._breeze_depth_runners)
        self.assertEqual(model.weights.device, 'cpu')
        self.assertEqual(codec.weights.device, 'cpu')
        self.assertIs(model.rotary.original_inv_freq, model.rotary.inv_freq)
        self.assertIsNot(codec.rotary.original_inv_freq, codec.rotary.inv_freq)
        self.assertEqual(codec.rotary.original_inv_freq.device, 'cpu')

        worker.move_bundle(self.bundle, self.bundle.device)
        self.assertEqual((self.bundle.model, self.bundle.codec, self.bundle.tokenizer), (model, codec, tokenizer))
        self.assertFalse(model._breeze_depth_runners)
        self.assertEqual(model.weights.device, 'cuda:0')
        self.assertEqual(codec.weights.device, 'cuda:0')
        self.assertIs(model.rotary.original_inv_freq, model.rotary.inv_freq)
        self.assertEqual(codec.rotary.original_inv_freq.device, 'cuda:0')

    def test_failed_wake_rolls_back_and_failed_rollback_retries_sleep(self):
        residency = worker.BundleResidency()
        codec_move = self.bundle.codec.to
        for fail_rollback in (False, True):
            with self.subTest(fail_rollback=fail_rollback):
                residency.sleep(self.loader, self.bundle)

                def fail_move(device):
                    if device == 'cuda:0':
                        codec_move(device)
                        raise RuntimeError('GPU OOM')
                    if fail_rollback:
                        raise RuntimeError('CPU transfer failed')
                    codec_move(device)

                with patch.object(self.bundle.codec, 'to', side_effect=fail_move):
                    with self.assertRaisesRegex(RuntimeError, 'GPU OOM'):
                        residency.wake(self.loader, self.bundle)
                    self.assertEqual(residency.state, 'moving' if fail_rollback else 'parked')
                    self.assertEqual(self.bundle.codec.weights.device, 'cuda:0' if fail_rollback else 'cpu')

                residency.sleep(self.loader, self.bundle)
                self.assertEqual(residency.state, 'parked')
                self.assertEqual(self.bundle.model.weights.device, 'cpu')
                self.assertEqual(self.bundle.codec.weights.device, 'cpu')
                residency.wake(self.loader, self.bundle)
                self.assertEqual(residency.state, 'resident')
                self.assertEqual(self.bundle.codec.weights.device, 'cuda:0')


if __name__ == '__main__':
    unittest.main()
